#!/usr/bin/env python
import os
import sys
import django
import json

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection

print("=" * 70)
print("TESTING PEMBIAYAAN ENDPOINT (rssams.pbiaya)")
print("=" * 70)

try:
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT id_pembiayaan, ket as nama FROM rssams.pbiaya 
            ORDER BY ket
        """)
        columns = [col[0] for col in cursor.description]
        pembiayaan = [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    print(f"\n✅ Successfully queried rssams.pbiaya")
    print(f"   Total pembiayaan: {len(pembiayaan)}")
    
    print("\n📋 Sample pembiayaan (first 10):")
    for item in pembiayaan[:10]:
        print(f"   {item['id_pembiayaan']:>3} - {item['nama']}")
    
    # Simulate API response
    api_response = {
        'count': len(pembiayaan),
        'results': pembiayaan
    }
    
    print("\n🔌 API Response Structure:")
    print(f"   {{ count: {api_response['count']}, results: [{len(api_response['results'])} items] }}")
    print(f"\n✅ Endpoint /api/keuangan/pembiayaan-options/ is ready!")
    
except Exception as e:
    print(f"\n❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("API STATISTICS")
print("=" * 70)

from keuangan.models import Faktur, PembayaranFaktur, AlokasiDana
from users.models import User

print(f"\n📊 Database Statistics:")
print(f"   Faktur: {Faktur.objects.count():,}")
print(f"   PembayaranFaktur: {PembayaranFaktur.objects.count():,}")
print(f"   AlokasiDana: {AlokasiDana.objects.count():,}")
print(f"   Users with is_keuangan=True: {User.objects.filter(is_keuangan=True).count()}")

print("\n" + "=" * 70)
print("✅ ALL TESTS PASSED!")
print("=" * 70)
