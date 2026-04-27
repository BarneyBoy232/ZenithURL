import requests
import firebase_admin
from firebase_admin import credentials, firestore
import time

# 1. Connect to your Firebase Database
# You download this JSON file from your Firebase Project Settings -> Service Accounts
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Replace this with the App ID from your React code
APP_ID = "default-app-id" 
DOMAINS_REF = db.collection('artifacts').document(APP_ID).collection('public').document('data').collection('domains')

def get_all_subdomains():
    """
    This asks your DNS provider (e.g., Vercel, Cloudflare, AWS) for the master list.
    Example below uses the Vercel API.
    """
    VERCEL_API_TOKEN = "your_vercel_api_token"
    PROJECT_ID = "your_vercel_project_id"
    
    headers = {"Authorization": f"Bearer {VERCEL_API_TOKEN}"}
    response = requests.get(f"https://api.vercel.com/v9/projects/{PROJECT_ID}/domains", headers=headers)
    
    if response.status_code == 200:
        return [domain['name'] for domain in response.json()['domains']]
    return []

def sync_to_database():
    print("Fetching master list from DNS provider...")
    active_domains = get_all_subdomains()
    
    print(f"Found {len(active_domains)} active domains. Syncing to Firebase...")
    
    # Push everything to Firebase (React will update live instantly)
    for domain in active_domains:
        # Strip out the main domain to just get the 'xx' part
        subdomain = domain.replace(".zenithurl.com", "") 
        
        # Skip the main domain itself
        if subdomain == "zenithurl.com":
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
    # Run this once, or set it to run on a loop every 5 minutes!
    sync_to_database()