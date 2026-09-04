from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()


class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ('Hak Akses & Role SIMAK', {
            'fields': (
                'role',
                'unit',
                'is_driver',
                'is_it',
                'is_keuangan',
                'is_petty_cash_cashier',
                'akses_kas_besar',
                'akses_reimbursement',
                'akses_catatan_utang',
                'is_logistik',
                'is_akuntansi',
            ),
        }),
    )
    list_display = (
        'username',
        'first_name',
        'last_name',
        'role',
        'is_keuangan',
        'akses_reimbursement',
        'is_active',
    )


admin.site.register(User, CustomUserAdmin)