from django.db import models, transaction
from django.utils import timezone


class NumberingSequence(models.Model):
    """
    Sequence generator per jenis dokumen dan tahun dengan row-level lock.
    Format output: PREFIX-YYYY-NNNNN (contoh: PO-2026-00001, GRN-2026-00001).
    """
    jenis = models.CharField(max_length=20)  # PO, GRN, REQ, ISS, OPN
    tahun = models.PositiveIntegerField()
    terakhir = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'gdg_nomor_seq'
        unique_together = ('jenis', 'tahun')

    def __str__(self):
        return f"{self.jenis}-{self.tahun}: {self.terakhir}"

    @classmethod
    def get_next(cls, jenis: str, tahun: int = None, width: int = 5) -> str:
        if tahun is None:
            tahun = timezone.localdate().year
        jenis = jenis.upper().strip()

        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                jenis=jenis,
                tahun=tahun,
                defaults={'terakhir': 0}
            )
            seq.terakhir += 1
            seq.save(update_fields=['terakhir'])
            nomor = f"{jenis}-{tahun}-{seq.terakhir:0{width}d}"
            return nomor

