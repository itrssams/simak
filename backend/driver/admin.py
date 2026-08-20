from django.contrib import admin
from .models import Kendaraan, LogPerjalanan, LaporanPerjalanan, LogBBM, LogMaintenance

admin.site.register(Kendaraan)
admin.site.register(LogPerjalanan)
admin.site.register(LaporanPerjalanan)
admin.site.register(LogBBM)
admin.site.register(LogMaintenance)
