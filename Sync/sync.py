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
VERCEL_CNAME_TARGET = "cname.vercel-dns.com"   # universal Vercel target for any subdomain


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


def get_cloudflare_subdomains():
    """Subdomains that already have an A/CNAME record in Cloudflare."""
    r = requests.get(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records",
        headers=cloudflare_headers(), params={"per_page": 100}
    )
    if r.status_code != 200:
        print(f"Cloudflare list failed: {r.status_code} {r.text}")
        return set()
    subs = set()
    for rec in r.json().get("result", []):
        if rec.get("type") in ("A", "CNAME"):
            s = clean_subdomain(rec.get("name", ""))
            if s:
                subs.add(s)
    return subs


def get_vercel_subdomains():
    """Subdomains assigned to Vercel projects. Returns None (skip the Vercel
    step) if there's no VERCEL_TOKEN or the API can't be reached, so the sync
    still runs Cloudflare-only."""
    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    try:
        projects = requests.get("https://api.vercel.com/v9/projects?limit=100", headers=headers, timeout=30)
        projects.raise_for_status()
        subs = set()
        for p in projects.json().get("projects", []):
            r = requests.get(
                f"https://api.vercel.com/v9/projects/{p['id']}/domains?limit=100",
                headers=headers, timeout=30
            )
            r.raise_for_status()
            for d in r.json().get("domains", []):
                s = clean_subdomain(d.get("name", ""))
                if s:
                    subs.add(s)
        return subs
    except Exception as e:
        print(f"Vercel lookup failed ({e}); skipping the Vercel step this run.")
        return None


def create_cloudflare_record(subdomain):
    """Add a DNS-only CNAME for a Vercel site that Cloudflare is missing."""
    body = {
        "type": "CNAME",
        "name": f"{subdomain}.zenithurl.com",
        "content": VERCEL_CNAME_TARGET,
        "proxied": False,
        "ttl": 1,
    }
    r = requests.post(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records",
        headers=cloudflare_headers(), json=body
    )
    if r.status_code in (200, 201):
        print(f"Created Cloudflare record: {subdomain}")
        return True
    print(f"Failed to create record for {subdomain}: {r.status_code} {r.text}")
    return False


def sync_to_database():
    cf_subs = get_cloudflare_subdomains()

    # If a Vercel token is present, make sure every Vercel site has a matching
    # Cloudflare record. This is what lets a new site you deploy show up with no
    # manual Cloudflare step: Vercel is the source of truth, we backfill Cloudflare.
    vercel_subs = get_vercel_subdomains()
    if vercel_subs is not None:
        for sub in sorted(vercel_subs - cf_subs):
            if create_cloudflare_record(sub):
                cf_subs.add(sub)

    active_subdomains = sorted(cf_subs)
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
