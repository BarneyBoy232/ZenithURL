import requests
import firebase_admin
from firebase_admin import credentials, firestore
import time
import os
import json

current_dir = os.path.dirname(__file__)

if not firebase_admin._apps:
    # Credentials come from the FIREBASE_CREDENTIALS secret when run by GitHub
    # Actions, or a local (gitignored) firebase-credentials.json when run by hand.
    if os.environ.get("FIREBASE_CREDENTIALS"):
        cred = credentials.Certificate(json.loads(os.environ["FIREBASE_CREDENTIALS"]))
    else:
        cred = credentials.Certificate(os.path.join(current_dir, "firebase-credentials.json"))
    firebase_admin.initialize_app(cred)

db = firestore.client()
APP_ID = "zenithurl"
DOMAINS_REF = db.collection('artifacts').document(APP_ID).collection('public').document('data').collection('domains')

ZONE_ID = "cb957de4a36dcefa4904df15bb79f410"   # zenithurl.com DNS zone (not secret)
FALLBACK_CNAME = "cname.vercel-dns.com"        # universal Vercel target (always works)


def cloudflare_headers():
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        raise SystemExit("CLOUDFLARE_API_TOKEN is not set — add it as a GitHub Actions secret (or a local env var).")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def clean_subdomain(name):
    """Turn a full domain name into a bare subdomain id, or None if it isn't a
    listable site (the apex, www, a wildcard, or a multi-level name)."""
    sub = name.replace(".zenithurl.com", "").lower()
    if sub in ("zenithurl.com", "www") or not sub or sub == name or "." in sub or "*" in sub:
        return None
    return sub


def get_cloudflare_records():
    """{subdomain: {'id', 'content'}} for the A/CNAME records already in Cloudflare."""
    r = requests.get(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records",
        headers=cloudflare_headers(), params={"per_page": 100}
    )
    if r.status_code != 200:
        print(f"Cloudflare list failed: {r.status_code} {r.text}")
        return {}
    recs = {}
    for rec in r.json().get("result", []):
        if rec.get("type") in ("A", "CNAME"):
            s = clean_subdomain(rec.get("name", ""))
            if s:
                recs[s] = {"id": rec["id"], "content": (rec.get("content") or "").rstrip(".")}
    return recs


def recommended_cname(domain, headers):
    """Vercel's preferred CNAME target for a domain (its top-ranked value, which
    is what keeps Cloudflare's config green). Falls back to the universal target."""
    try:
        cfg = requests.get(f"https://api.vercel.com/v6/domains/{domain}/config", headers=headers, timeout=30).json()
        ranked = cfg.get("recommendedCNAME") or []
        if ranked:
            return ranked[0]["value"].rstrip(".")
    except Exception:
        pass
    return FALLBACK_CNAME


def get_vercel_targets():
    """{subdomain: preferred_cname} for every Vercel site. Returns None (skip the
    Vercel step) if there's no VERCEL_TOKEN or the API can't be reached."""
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    try:
        targets = {}
        projects = requests.get("https://api.vercel.com/v9/projects?limit=100", headers=headers, timeout=30)
        projects.raise_for_status()
        for p in projects.json().get("projects", []):
            r = requests.get(
                f"https://api.vercel.com/v9/projects/{p['id']}/domains?limit=100",
                headers=headers, timeout=30
            )
            r.raise_for_status()
            for d in r.json().get("domains", []):
                s = clean_subdomain(d.get("name", ""))
                if s:
                    targets[s] = recommended_cname(d.get("name"), headers)
        return targets
    except Exception as e:
        print(f"Vercel lookup failed ({e}); skipping the Vercel step this run.")
        return None


def upsert_cloudflare_record(subdomain, target, existing):
    """Create the DNS-only CNAME if Cloudflare is missing it, or update it if it
    points somewhere other than Vercel's preferred target (kills the yellow
    'DNS Change Recommended' warning)."""
    body = {"type": "CNAME", "name": f"{subdomain}.zenithurl.com", "content": target, "proxied": False, "ttl": 1}
    if subdomain not in existing:
        r = requests.post(
            f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records",
            headers=cloudflare_headers(), json=body
        )
        print(f"Created Cloudflare record: {subdomain} -> {target}" if r.status_code in (200, 201)
              else f"Failed to create {subdomain}: {r.status_code} {r.text}")
    elif existing[subdomain]["content"] != target:
        rid = existing[subdomain]["id"]
        r = requests.put(
            f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records/{rid}",
            headers=cloudflare_headers(), json=body
        )
        print(f"Updated Cloudflare record: {subdomain} -> {target}" if r.status_code == 200
              else f"Failed to update {subdomain}: {r.status_code} {r.text}")


def sync_to_database():
    cf = get_cloudflare_records()

    # If a Vercel token is present, make every Vercel site's Cloudflare record
    # exist and point at Vercel's preferred target. This is what lets a new site
    # appear (and stay green) with no manual Cloudflare step.
    vercel = get_vercel_targets()
    if vercel is not None:
        for sub, target in sorted(vercel.items()):
            upsert_cloudflare_record(sub, target, cf)
            cf.setdefault(sub, {"id": None, "content": target})

    active_subdomains = sorted(cf.keys())
    if not active_subdomains:
        print("No domains found.")
        return

    # Add new sites to the directory / refresh existing ones.
    for subdomain in active_subdomains:
        doc_ref = DOMAINS_REF.document(subdomain)
        if doc_ref.get().exists:
            doc_ref.update({"lastSeen": int(time.time() * 1000)})
        else:
            doc_ref.set({
                "name": subdomain,
                "status": "finished",
                "autoDetected": True,
                "lastSeen": int(time.time() * 1000)
            })
            print(f"Synced new domain: {subdomain}")

    # Drop directory entries that no longer have a record.
    for doc in DOMAINS_REF.stream():
        if doc.id not in active_subdomains:
            print(f"Removing old domain: {doc.id}")
            DOMAINS_REF.document(doc.id).delete()


if __name__ == "__main__":
    sync_to_database()
