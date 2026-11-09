// Jalankan: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, guessMapping, parseAmount, parseDate, parseStatus } from "../lib/csv-import.ts";

test("parseDate: berbagai format", () => {
  assert.equal(parseDate("2026-11-08"), "2026-11-08");
  assert.equal(parseDate("08/11/2026"), "2026-11-08");          // default DMY (Indonesia)
  assert.equal(parseDate("11/08/2026", "MDY"), "2026-11-08");   // format Airbnb (AS)
  assert.equal(parseDate("25/12/2026"), "2026-12-25");          // hari > 12 → pasti DMY
  assert.equal(parseDate("12/25/2026"), "2026-12-25");          // bulan > 12 → pasti MDY
  assert.equal(parseDate("Nov 8, 2026"), "2026-11-08");
  assert.equal(parseDate("31/02/2026"), null);                  // tanggal tidak ada
  assert.equal(parseDate(""), null);
});

test("parseAmount: format Rupiah dan internasional", () => {
  assert.equal(parseAmount("Rp 1.500.000"), 1500000);
  assert.equal(parseAmount("1,500,000.00"), 1500000);
  assert.equal(parseAmount("1.500.000,50"), 1500001);
  assert.equal(parseAmount("IDR 2500000"), 2500000);
  assert.equal(parseAmount("2500000.00"), 2500000);
  assert.equal(parseAmount("-350,000"), 350000);
  assert.equal(parseAmount("abc"), null);
});

test("parseStatus", () => {
  assert.equal(parseStatus("Cancelled by guest"), "cancelled");
  assert.equal(parseStatus("canceled"), "cancelled");
  assert.equal(parseStatus("No-show"), "no_show");
  assert.equal(parseStatus("OK"), "");
});

test("guessMapping: header Booking.com & Airbnb", () => {
  const booking = guessMapping(["Book number", "Booked by", "Guest name(s)", "Check-in", "Check-out", "Price", "Commission amount", "Status", "Persons"]);
  assert.equal(booking.external_ref, "Book number");
  assert.equal(booking.guest_name, "Guest name(s)");
  assert.equal(booking.check_in, "Check-in");
  assert.equal(booking.gross_amount, "Price");
  assert.equal(booking.commission_amount, "Commission amount");
  const airbnb = guessMapping(["Confirmation code", "Status", "Guest name", "Start date", "End date", "# of nights", "Earnings"]);
  assert.equal(airbnb.external_ref, "Confirmation code");
  assert.equal(airbnb.check_in, "Start date");
  assert.equal(airbnb.check_out, "End date");
  assert.equal(airbnb.gross_amount, "Earnings");
});

test("buildRows: menandai baris bermasalah dan melewati baris kosong", () => {
  const rows = buildRows(
    [
      { a: "2026-12-01", b: "2026-12-04", n: "Sarah", p: "Rp 9.000.000" },
      { a: "2026-12-05", b: "2026-12-03", n: "Budi", p: "x" },
      { a: "", b: "", n: "", p: "" },
    ],
    { check_in: "a", check_out: "b", guest_name: "n", gross_amount: "p" },
    { dateFormat: "auto", defaultChannel: "Airbnb" },
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].problems, []);
  assert.equal(rows[0].gross_amount, 9000000);
  assert.equal(rows[0].channel_name, "Airbnb");
  assert.ok(rows[1].problems.length >= 2);
});
