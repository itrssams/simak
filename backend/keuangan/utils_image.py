"""
Utility untuk image compression di backend
"""
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import os


def compress_image(image_field, max_width=1920, max_height=1920, quality=75):
    """
    Compress image file untuk menghemat storage
    
    Args:
        image_field: Django ImageField instance
        max_width: Maximum width in pixels (default 1920)
        max_height: Maximum height in pixels (default 1920)
        quality: JPEG quality 0-100 (default 75)
    
    Returns:
        bool: True jika berhasil dikompres, False jika tidak ada perubahan
    """
    if not image_field:
        return False
    
    try:
        # Buka image
        img = Image.open(image_field.open())
        
        # Get original size
        original_size = image_field.size
        
        # Resize jika lebih besar dari max dimensions
        if img.width > max_width or img.height > max_height:
            img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        
        # Convert RGBA to RGB jika JPEG
        if img.mode in ('RGBA', 'LA', 'P'):
            # Create white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        
        # Compress and save
        output = BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        output.seek(0)
        
        # Get filename
        filename = os.path.basename(image_field.name)
        if not filename.lower().endswith('.jpg'):
            filename = os.path.splitext(filename)[0] + '.jpg'
        
        # Update image field
        image_field.save(
            filename,
            ContentFile(output.getvalue()),
            save=False
        )
        
        compressed_size = len(output.getvalue())
        
        # Log compression result
        if original_size > 0:
            savings = ((original_size - compressed_size) / original_size) * 100
            print(f"Image compressed: {original_size/1024:.1f}KB → {compressed_size/1024:.1f}KB (saved {savings:.1f}%)")
        
        return True
        
    except Exception as e:
        print(f"Error compressing image: {str(e)}")
        return False


def get_image_size_kb(image_field):
    """
    Get image file size in KB
    
    Args:
        image_field: Django ImageField instance
    
    Returns:
        float: Size in KB
    """
    if not image_field:
        return 0
    return image_field.size / 1024


def validate_image_size(image_field, max_size_mb=10):
    """
    Validate image file size
    
    Args:
        image_field: Django ImageField instance
        max_size_mb: Maximum allowed size in MB (default 10)
    
    Returns:
        tuple: (is_valid: bool, message: str)
    """
    if not image_field:
        return False, "File tidak ditemukan"
    
    max_size_bytes = max_size_mb * 1024 * 1024
    
    if image_field.size > max_size_bytes:
        return False, f"File terlalu besar (max {max_size_mb}MB)"
    
    return True, "OK"
