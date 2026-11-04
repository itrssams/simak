import { useEffect } from 'react';

let lockCount = 0;
let originalHtmlOverflow = '';
let originalBodyOverflow = '';
let originalHtmlOverscroll = '';
let originalBodyOverscroll = '';

/**
 * Hook to lock background scrolling when modals or popups are open.
 * Supports multiple nested/sequential modals using reference counting.
 * Also optionally handles Escape key to close the modal.
 *
 * @param {boolean} isLocked - Whether the scroll should be locked (usually modal's isOpen state)
 * @param {Function|null} onClose - Optional callback invoked when Escape key is pressed
 */
export function useBodyScrollLock(isLocked = true, onClose = null) {
    useEffect(() => {
        if (!isLocked) return;

        if (lockCount === 0) {
            originalHtmlOverflow = document.documentElement.style.overflow;
            originalBodyOverflow = document.body.style.overflow;
            originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;
            originalBodyOverscroll = document.body.style.overscrollBehavior;

            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overscrollBehavior = 'none';
            document.body.style.overscrollBehavior = 'none';
            document.documentElement.classList.add('aset-modal-open');
            document.body.classList.add('aset-modal-open');
        }
        lockCount++;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && typeof onClose === 'function') {
                onClose();
            }
        };

        if (onClose) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            if (onClose) {
                window.removeEventListener('keydown', handleKeyDown);
            }
            lockCount = Math.max(0, lockCount - 1);
            if (lockCount === 0) {
                document.documentElement.style.overflow = originalHtmlOverflow;
                document.body.style.overflow = originalBodyOverflow;
                document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
                document.body.style.overscrollBehavior = originalBodyOverscroll;
                document.documentElement.classList.remove('aset-modal-open');
                document.body.classList.remove('aset-modal-open');
            }
        };
    }, [isLocked, onClose]);
}

export default useBodyScrollLock;

