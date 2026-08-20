from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LogbookViewSet

router = DefaultRouter()
router.register(r'', LogbookViewSet, basename='logbook')

urlpatterns = [
    path('', include(router.urls)),
]
