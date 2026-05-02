import requests
import firebase_admin
from firebase_admin import credentials, firestore
import time
import os

# 1. Dynamically find the JSON file inside the exact same folder as this script
current_dir = os.path.dirname(__file__)
service_account_path = os.path.join(current_dir, "zenithurl-e9909-firebase-adminsdk-fbsvc-2eeddf368a.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# This must match the App ID in your React App.jsx
APP_ID = "zenithurl" 
DOMAINS_REF = db.collection('artifacts').document(APP_ID).collection('public').document('data').collection('domains')

def get_all_subdomains():
    """
    Asks Cloudflare for the master list of DNS records.
    """
    CLOUDFLARE_API_TOKEN = "cfut_N9GuNPVLJ2pgZs1Ojf302MEZmTp9DNlwPB9Bn2tu9f77f398"
    ZONE_ID = "cb957de4a36dcefa4904df15bb79f410" 
    
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Cloudflare API to list DNS records
    response = requests.get(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", 
        headers=headers,
        params={"per_page": 100}
    )
    
    if response.status_code == 200:
        records = response.json().get('result', [])
        # We only care about A and CNAME records that point to subdomains
        return [record['name'] for record in records if record['type'] in ['A', 'CNAME']]
    
    print(f"Failed to fetch from Cloudflare: {response.text}")
    return []

def sync_to_database():
    print("Fetching master list from Cloudflare...")
    active_domains = get_all_subdomains()
    
    if not active_domains:
        print("No domains found or failed to fetch.")
        return

    print(f"Found {len(active_domains)} active records. Syncing to Firebase...")
    
    for domain in active_domains:
        # Clean the name (e.g., 'test.zenithurl.com' -> 'test')
        subdomain = domain.replace(".zenithurl.com", "").lower() 
        
        # Skip root domain or empty strings
        if subdomain == "zenithurl.com" or not subdomain or subdomain == domain:
            continue
            
        doc_ref = DOMAINS_REF.document(subdomain)
        doc_ref.set({
            "name": subdomain,
            "status": "finished",
            "autoDetected": True,
            "lastSeen": int(time.time() * 1000)
        }, merge=True)
        print(f"Synced: {subdomain}")

if __name__ == "__main__":
    sync_to_database()