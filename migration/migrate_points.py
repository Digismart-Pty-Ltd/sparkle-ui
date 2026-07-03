import pandas as pd
import firebase_admin
from firebase_admin import credentials, db as rtdb
from datetime import datetime, timedelta

# ── CONFIG — update these ─────────────────────────────────────────────────────
FIREBASE_CRED_PATH = "serviceAccount.json"   # path to your service account JSON
DATABASE_URL = "https://gym-pro-20ee6-default-rtdb.europe-west1.firebasedatabase.app"
CSV_PATH = "export-customers-30-06-2026-19_44.csv"   # put CSV in same folder as this script
DRY_RUN = False   # Set to False to actually write to Firebase
# ─────────────────────────────────────────────────────────────────────────────

def load_old_app_data(csv_path):
    df = pd.read_csv(csv_path, sep=';')
    df.columns = df.columns.str.strip()
    members = []
    for _, row in df.iterrows():
        email = str(row.get('Email', '') or '').strip().lower()
        if not email:
            continue
        punches = row.get('Punches', 0)
        punches_total = row.get('Punches total', 0)
        punches = 0 if pd.isna(punches) else int(punches)
        punches_total = 0 if pd.isna(punches_total) else int(punches_total)
        name = f"{str(row.get('Name','') or '').strip()} {str(row.get('Surname','') or '').strip()}".strip()
        members.append({
            'email': email,
            'name': name,
            'punches': punches,
            'punches_total': punches_total,
        })
    return members

def load_new_app_users(database_url, cred_path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {'databaseURL': database_url})
    ref = rtdb.reference('mk2_users')
    data = ref.get()
    if not data:
        return {}
    users = {}
    for uid, val in data.items():
        email = str(val.get('email', '') or '').strip().lower()
        if email:
            users[email] = {'uid': uid, **val}
    return users

def make_backdated_checkins(count):
    """
    Create N backdated check-in entries spread over the past N days.
    Represents the member's current reward cycle position from the old app.
    """
    checkins = []
    base = datetime.now()
    for i in range(count):
        d = base - timedelta(days=i)
        checkins.append({
            'date': d.strftime('%d/%m/%Y'),
            'time': '07:00',
            'backdated': True,
            'migratedFromOldApp': True,
        })
    return checkins

def run_migration(dry_run=True):
    print("=" * 60)
    print("MK Two Rivers — Points Migration")
    print(f"Mode: {'DRY RUN (no writes)' if dry_run else 'LIVE WRITE MODE'}")
    print("=" * 60)

    old_members = load_old_app_data(CSV_PATH)
    print(f"\nOld app: {len(old_members)} members loaded from CSV")

    new_users = load_new_app_users(DATABASE_URL, FIREBASE_CRED_PATH)
    print(f"New app: {len(new_users)} members loaded from Firebase")

    matched = []
    skipped_zero = []
    unmatched = []

    for m in old_members:
        if m['punches_total'] == 0:
            skipped_zero.append(m)
            continue

        new_user = new_users.get(m['email'])
        if not new_user:
            unmatched.append(m)
            continue

        uid = new_user['uid']
        existing_points = int(new_user.get('points', 0) or 0)
        existing_checkins = new_user.get('checkIns', [])
        if not isinstance(existing_checkins, list):
            existing_checkins = []

        points_to_add = m['punches_total'] * 10
        new_points = existing_points + points_to_add
        new_checkins = existing_checkins + make_backdated_checkins(m['punches'])

        matched.append({
            'uid': uid,
            'email': m['email'],
            'name': m['name'],
            'old_punches': m['punches'],
            'old_punches_total': m['punches_total'],
            'existing_points': existing_points,
            'points_to_add': points_to_add,
            'new_points': new_points,
            'checkins_to_add': m['punches'],
            'new_checkin_count': len(new_checkins),
            'new_checkins': new_checkins,
        })

    # ── Print report ──────────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"MATCHED ({len(matched)}) — will be updated:")
    print(f"{'─'*60}")
    for m in matched:
        print(f"  + {m['name']} ({m['email']})")
        print(f"    Points : {m['existing_points']} + {m['points_to_add']} = {m['new_points']}")
        print(f"    Cycle  : +{m['checkins_to_add']} check-ins (total: {m['new_checkin_count']})")

    print(f"\n{'─'*60}")
    print(f"SKIPPED — 0 punches, nothing to migrate ({len(skipped_zero)}):")
    print(f"{'─'*60}")
    for m in skipped_zero:
        print(f"  - {m['name']} ({m['email']})")

    print(f"\n{'─'*60}")
    print(f"UNMATCHED — not yet on new app ({len(unmatched)}):")
    print(f"{'─'*60}")
    for m in unmatched:
        print(f"  ? {m['name']} ({m['email']}) — {m['punches_total']} total punches")

    print(f"\n{'─'*60}")
    print(f"SUMMARY")
    print(f"{'─'*60}")
    print(f"  Matched & queued : {len(matched)}")
    print(f"  Skipped (0 pts)  : {len(skipped_zero)}")
    print(f"  Unmatched        : {len(unmatched)}")
    print(f"{'─'*60}")

    if dry_run:
        print("\nDRY RUN complete — no data written.")
        print("Set DRY_RUN = False and re-run to apply changes.")
        return

    confirm = input(f"\nReady to write {len(matched)} updates to Firebase. Type YES to confirm: ")
    if confirm.strip() != "YES":
        print("Aborted — no changes made.")
        return

    success = 0
    errors = 0
    for m in matched:
        try:
            rtdb.reference(f"mk2_users/{m['uid']}").update({
                'points': m['new_points'],
                'checkIns': m['new_checkins'],
            })
            print(f"  + Updated {m['name']}")
            success += 1
        except Exception as e:
            print(f"  x Failed {m['name']}: {e}")
            errors += 1

    print(f"\nDone — {success} updated, {errors} failed.")

if __name__ == "__main__":
    run_migration(dry_run=DRY_RUN)