from django.apps import AppConfig


class KeuanganConfig(AppConfig):
    name = 'keuangan'
    
    def ready(self):
        import keuangan.signals
