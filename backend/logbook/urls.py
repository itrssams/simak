from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LogbookViewSet, TaskViewSet

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'', LogbookViewSet, basename='logbook')

urlpatterns = [
    path('', include(router.urls)),
]
