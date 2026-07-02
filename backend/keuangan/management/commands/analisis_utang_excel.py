from pathlib import Path

import pandas as pd

from django.core.management.base import BaseCommand
from keuangan.models import UtangSupplier


class Command(BaseCommand):
    help = "Analisis utang outstanding dari Excel"

    def add_arguments(self, parser):
        parser.add_argument(
            "excel_file",
            type=str,
            help="Path file excel"
        )

    def handle(self, *args, **options):

        excel_file = options["excel_file"]

        if not Path(excel_file).exists():
            self.stdout.write(
                self.style.ERROR(
                    f"File tidak ditemukan: {excel_file}"
                )
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f"Membaca file: {excel_file}"
            )
        )

        df = pd.read_excel(excel_file)

        # ==========================
        # Mapping kolom Excel OTS
        # ==========================
        try:
            spb_col = df.columns[7]
            vendor_col = df.columns[8]
            keterangan_col = df.columns[12]
            sisa_col = df.columns[19]
        except IndexError:
            self.stdout.write(
                self.style.ERROR(
                    "Struktur kolom Excel tidak sesuai."
                )
            )
            return

        df = df.rename(columns={
            spb_col: "SPB",
            vendor_col: "VENDOR",
            keterangan_col: "KETERANGAN",
            sisa_col: "SISA",
        })

        df["SISA"] = pd.to_numeric(
            df["SISA"],
            errors="coerce"
        ).fillna(0)

        # hanya yang masih ada sisa
        outstanding_df = df[df["SISA"] > 0].copy()

        self.stdout.write(
            self.style.SUCCESS(
                f"Outstanding ditemukan: {len(outstanding_df)}"
            )
        )

        match_rows = []
        manual_rows = []

        for _, row in outstanding_df.iterrows():

            spb = str(row["SPB"]).strip()

            if (
                not spb
                or spb.lower() == "nan"
                or spb == ""
            ):
                continue

            qs = UtangSupplier.objects.filter(
                nomor_spb=spb
            )

            jumlah = qs.count()

            if jumlah == 1:

                utang = qs.first()

                match_rows.append({
                    "SPB": spb,
                    "VENDOR_EXCEL": row["VENDOR"],
                    "KETERANGAN_EXCEL": row["KETERANGAN"],
                    "SISA_EXCEL": row["SISA"],
                    "VENDOR_DB": utang.vendor_nama,
                    "FAKTUR_DB": utang.nomor_faktur,
                    "NOMINAL_DB": float(utang.nominal),
                    "STATUS": "MATCH"
                })

            elif jumlah == 0:

                manual_rows.append({
                    "SPB": spb,
                    "VENDOR_EXCEL": row["VENDOR"],
                    "KETERANGAN_EXCEL": row["KETERANGAN"],
                    "SISA_EXCEL": row["SISA"],
                    "ALASAN": "SPB tidak ditemukan"
                })

            else:

                manual_rows.append({
                    "SPB": spb,
                    "VENDOR_EXCEL": row["VENDOR"],
                    "KETERANGAN_EXCEL": row["KETERANGAN"],
                    "SISA_EXCEL": row["SISA"],
                    "ALASAN": f"SPB duplikat ({jumlah} data)"
                })

        output_file = "/tmp/hasil_analisis_utang.xlsx"

        with pd.ExcelWriter(output_file) as writer:

            pd.DataFrame(match_rows).to_excel(
                writer,
                sheet_name="MATCH",
                index=False
            )

            pd.DataFrame(manual_rows).to_excel(
                writer,
                sheet_name="CEK_MANUAL",
                index=False
            )

        self.stdout.write("")
        self.stdout.write("=" * 60)
        self.stdout.write("HASIL ANALISIS")
        self.stdout.write("=" * 60)
        self.stdout.write(f"Outstanding : {len(outstanding_df)}")
        self.stdout.write(f"MATCH       : {len(match_rows)}")
        self.stdout.write(f"CEK MANUAL  : {len(manual_rows)}")
        self.stdout.write("=" * 60)
        self.stdout.write(f"Output      : {output_file}")
        self.stdout.write("=" * 60)