
    (function() {
        // منع الزر الأيمن
        document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        
        // منع اختصارات لوحة المفاتيح
        document.onkeydown = function(e) {
            // منع F12
            if(e.keyCode == 123) return false;
            
            if(e.ctrlKey && e.shiftKey && (e.keyCode == 'I'.charCodeAt(0) || e.keyCode == 'J'.charCodeAt(0) || e.keyCode == 'C'.charCodeAt(0))) return false;
            
            // منع Ctrl+U (عرض المصدر) و Ctrl+S (حفظ الصفحة) و Ctrl+P (طباعة) و Ctrl+C (نسخ)
            if(e.ctrlKey && (e.keyCode == 'U'.charCodeAt(0) || e.keyCode == 'S'.charCodeAt(0) || e.keyCode == 'P'.charCodeAt(0) || e.keyCode == 'C'.charCodeAt(0))) {
                e.preventDefault();
                return false;
            }
        };

        // منع عملية النسخ الفعلي حتى لو تم التحديد بطريقة ما
        document.addEventListener('copy', function(e) {
            e.preventDefault();
            return false;
        });
        
        // منع سحب وإفلات الصور والملفات
        document.addEventListener('dragstart', function(e) {
            e.preventDefault();
            return false;
        });
    })();
    