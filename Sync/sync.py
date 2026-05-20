import requests
import firebase_admin
from firebase_admin import credentials, firestore
import time
import os

current_dir = os.path.dirname(__file__)
service_account_path = os.path.join(current_dir, "firebase-credentials.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()
APP_ID = "zenithurl" 
DOMAINS_REF = db.collection('artifacts').document(APP_ID).collection('public').document('data').collection('domains')

def get_all_subdomains():
    CLOUDFLARE_API_TOKEN = "cfut_N9GuNPVLJ2pgZs1Ojf302MEZmTp9DNlwPB9Bn2tu9f77f398"
    ZONE_ID = "cb957de4a36dcefa4904df15bb79f410" 
    
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    response = requests.get(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", 
        headers=headers,
        params={"per_page": 100}
    )
    
    if response.status_code == 200:
        records = response.json().get('result', [])
        return [record['name'] for record in records if record['type'] in ['A', 'CNAME']]
    return []

def sync_to_database():
    active_domains_raw = get_all_subdomains()
    if not active_domains_raw: 
        print("No domains found in Cloudflare.")
        return

    # 1. Clean up Cloudflare list to match Firebase IDs
    active_subdomains = []
    for domain in active_domains_raw:
        subdomain = domain.replace(".zenithurl.com", "").lower()
        if subdomain not in ["zenithurl.com", "www"] and subdomain and subdomain != domain:
            active_subdomains.append(subdomain)

    # 2. Add/Update active domains
    for subdomain in active_subdomains:
        doc_ref = DOMAINS_REF.document(subdomain)
        doc = doc_ref.get()
        
        if doc.exists:
            doc_ref.update({"lastSeen": int(time.time() * 1000)})
        else:
            doc_ref.set({
                "name": subdomain,
                "status": "finished",
                "autoDetected": True,
                "lastSeen": int(time.time() * 1000)
            })
            print(f"Synced new domain: {subdomain}")

    # 3. Clean up deleted domains (Remove from Firebase if not in Cloudflare)
    firebase_docs = DOMAINS_REF.stream()
    for doc in firebase_docs:
        if doc.id not in active_subdomains:
            print(f"Removing old domain: {doc.id}")
            DOMAINS_REF.document(doc.id).delete()

if __name__ == "__main__":
    sync_to_database()