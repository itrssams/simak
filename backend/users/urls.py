from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, UnitViewSet

router = DefaultRouter()
router.register(r'units', UnitViewSet, basename='units')  # ← units DULU
router.register(r'', UserViewSet, basename='users')       # ← kosong belakangan

urlpatterns = [
    path('', include(router.urls)),
]