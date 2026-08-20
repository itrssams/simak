from rest_framework import serializers
from .models import InventoryOption, InventoryAsset

def user_name(user):
    if not user:
        return ''
    return user.get_full_name() or user.username

class InventoryOptionSerializer(serializers.ModelSerializer):
    option_type_label = serializers.CharField(source='get_option_type_display', read_only=True)

    class Meta:
        model = InventoryOption
        fields = [
            'id', 'option_type', 'option_type_label', 'name',
            'is_active', 'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'option_type_label', 'created_at', 'updated_at']

class InventoryAssetSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    condition_status_name = serializers.CharField(source='condition_status.name', read_only=True)
    ownership_status_name = serializers.CharField(source='ownership_status.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    foto_url = serializers.SerializerMethodField()

    class Meta:
        model = InventoryAsset
        fields = [
            'id', 'description', 'unit', 'unit_name', 'brand', 'location',
            'category', 'category_name', 'condition_status', 'condition_status_name',
            'foto', 'foto_url', 'manufacture_year', 'purchase_year',
            'purchase_price', 'recommended_action',
            'ownership_status', 'ownership_status_name',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'unit_name', 'category_name', 'condition_status_name',
            'ownership_status_name', 'foto_url', 'created_by',
            'created_by_name', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return user_name(obj.created_by)

    def get_foto_url(self, obj):
        if obj.foto:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.foto.url) if request else obj.foto.url
        return None

    def validate_option_type(self, attrs, field, expected_type):
        option = attrs.get(field) or getattr(self.instance, field, None)
        if option and option.option_type != expected_type:
            raise serializers.ValidationError({field: f'Pilihan harus bertipe {expected_type}.'})

    def validate(self, attrs):
        self.validate_option_type(attrs, 'unit', 'unit')
        self.validate_option_type(attrs, 'category', 'category')
        self.validate_option_type(attrs, 'condition_status', 'condition')
        self.validate_option_type(attrs, 'ownership_status', 'ownership')
        manufacture_year = attrs.get('manufacture_year', getattr(self.instance, 'manufacture_year', None))
        purchase_year = attrs.get('purchase_year', getattr(self.instance, 'purchase_year', None))
        if manufacture_year and (manufacture_year < 1900 or manufacture_year > 2100):
            raise serializers.ValidationError({'manufacture_year': 'Tahun pembuatan tidak valid.'})
        if purchase_year and (purchase_year < 1900 or purchase_year > 2100):
            raise serializers.ValidationError({'purchase_year': 'Tahun beli tidak valid.'})
        return attrs
