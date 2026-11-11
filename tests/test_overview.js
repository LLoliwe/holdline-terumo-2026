const test = require("node:test");
const assert = require("node:assert/strict");
const {nightBounds, groupNight} = require("../holdline/static/overview.js");

test("night starts at 18:00 and ends at 08:00", () => {
  assert.deepEqual(nightBounds("2026-10-30T01:00:00"), {start: "2026-10-29 18:00", end: "2026-10-30 08:00", key: "2026-10-29 18:00"});
  assert.equal(nightBounds("2026-10-30 18:30").start, "2026-10-30 18:00");
  assert.equal(nightBounds("2026-10-30 18:30").end, "2026-10-31 08:00");
  assert.equal(nightBounds("2026-10-30T17:59:00").start, "2026-10-29 18:00");
  assert.equal(nightBounds("2026-11-01T02:00:00").start, "2026-10-31 18:00");
  assert.equal(nightBounds("2027-01-01 03:00").start, "2026-12-31 18:00");
  assert.equal(nightBounds("2024-03-01T02:00:00").start, "2024-02-29 18:00");
  assert.equal(nightBounds("not a time"), null);
});

test("groups open holds that overlap the newest night", () => {
  const rows = [
    {id: "A", facility_id: "F1", facility_name: "One", start: "2026-10-30T01:00:00", end: "2026-10-30T04:00:00", kind: "EXCURSION", n: 26, peak: 8.5},
    {id: "B", facility_id: "F1", facility_name: "One", start: "2026-10-30T05:00:00", end: "2026-10-30T07:00:00", kind: "GAP_PRESUMED", n: 4},
    {id: "C", facility_id: "F2", facility_name: "Two", start: "2026-10-28T01:00:00", end: "2026-10-28T03:00:00", kind: "EXCURSION", n: 10},
    {id: "D", facility_id: "F3", facility_name: "Three", start: "2026-10-29T19:00:00", end: "2026-10-29T21:00:00", kind: "EXCURSION", n: 2, peak: 11},
    {id: "E", facility_id: "F4", facility_name: "Edge", start: "2026-10-29T16:00:00", end: "2026-10-29T18:00:00", kind: "EXCURSION", n: 1},
    {id: "F", facility_id: "F5", facility_name: "Morning", start: "2026-10-30T08:00:00", end: "2026-10-30T09:00:00", kind: "EXCURSION", n: 3},
  ];
  const g = groupNight(rows);
  assert.equal(g.night.start, "2026-10-29 18:00");
  assert.equal(g.night.end, "2026-10-30 08:00");
  assert.deepEqual(g.fridges.map(f => f.facility_id), ["F1", "F3"]);
  assert.equal(g.fridges[0].primary.id, "A");
  assert.equal(g.fridges[0].units, 30);
  assert.equal(g.nightUnits, 32);
  assert.equal(g.nightHolds, 3);
  assert.equal(g.otherHolds, 3);
  assert.equal(g.otherUnits, 14);
});

test("a hold that starts at 18:00 is on the night", () => {
  const g = groupNight([{id: "G", facility_id: "F9", facility_name: "Nine", start: "2026-10-30T18:00:00", end: "2026-10-30T19:00:00", kind: "EXCURSION", n: 1}]);
  assert.equal(g.fridges.length, 1);
  assert.equal(g.night.start, "2026-10-30 18:00");
});

const {groupWeek} = require("../holdline/static/overview.js");

test("last 7 nights put the newest night on the right", () => {
  const rows = [
    {id: "A", facility_id: "F1", facility_name: "One", start: "2026-10-30T01:00:00", end: "2026-10-30T04:00:00", kind: "EXCURSION", n: 26, peak: 8.5},
    {id: "B", facility_id: "F1", facility_name: "One", start: "2026-10-30T05:00:00", end: "2026-10-30T07:00:00", kind: "GAP_PRESUMED", n: 4},
    {id: "C", facility_id: "F2", facility_name: "Two", start: "2026-10-28T01:00:00", end: "2026-10-28T03:00:00", kind: "EXCURSION", n: 10},
    {id: "D", facility_id: "F3", facility_name: "Three", start: "2026-10-29T19:00:00", end: "2026-10-29T21:00:00", kind: "EXCURSION", n: 2, peak: 11},
    {id: "E", facility_id: "F4", facility_name: "Edge", start: "2026-10-29T16:00:00", end: "2026-10-29T18:00:00", kind: "EXCURSION", n: 1},
    {id: "F", facility_id: "F5", facility_name: "Morning", start: "2026-10-30T08:00:00", end: "2026-10-30T09:00:00", kind: "EXCURSION", n: 3},
  ];
  const g = groupWeek(rows);
  assert.equal(g.nights.length, 7);
  assert.equal(g.nights[0].start, "2026-10-23 18:00");
  assert.equal(g.nights[6].start, "2026-10-29 18:00");
  assert.equal(g.nights[6].end, "2026-10-30 08:00");
  assert.deepEqual(g.fridges.map(f => f.facility_id), ["F1", "F2", "F3"]);
  const f1 = g.fridges[0];
  assert.equal(f1.cells[6].primary.id, "A");
  assert.equal(f1.cells[6].units, 30);
  assert.equal(f1.cells[6].ex, true);
  assert.equal(f1.cells[6].gap, true);
  assert.equal(f1.cells[5].primary, null);
  assert.equal(g.fridges[1].cells.filter(c => c.primary).length, 1);
  assert.equal(g.fridges[1].cells.find(c => c.primary).primary.id, "C");
  assert.equal(g.weekHolds, 4);
  assert.equal(g.weekUnits, 42);
  assert.equal(g.otherHolds, 2);
  assert.equal(g.otherUnits, 4);
});

test("a hold that crosses 08:00 into the next evening is in both nights", () => {
  const g = groupWeek([
    {id: "S", facility_id: "F1", facility_name: "Span", start: "2026-11-01T07:00:00", end: "2026-11-01T19:00:00", kind: "EXCURSION", n: 5},
    {id: "T", facility_id: "F1", facility_name: "Span", start: "2026-11-01T18:30:00", end: "2026-11-01T20:00:00", kind: "GAP_PRESUMED", n: 9},
  ]);
  assert.equal(g.nights[0].start, "2026-10-26 18:00");
  assert.equal(g.nights[6].start, "2026-11-01 18:00");
  const cells = g.fridges[0].cells;
  const hit = cells.map((c, i) => c.primary ? i : -1).filter(i => i >= 0);
  assert.deepEqual(hit, [5, 6]);
  assert.equal(cells[5].primary.id, "S");
  assert.equal(cells[6].primary.id, "T");
  assert.equal(cells[6].ex, true);
  assert.equal(cells[6].gap, true);
  assert.equal(g.weekHolds, 2);
  assert.equal(g.fridges[0].units, 14);
});

test("a hold that ends at 18:00 does not enter the night that starts then", () => {
  const g = groupWeek([{id: "Z", facility_id: "F1", facility_name: "Edge", start: "2026-10-30T16:00:00", end: "2026-10-30T18:00:00", kind: "EXCURSION", n: 1}]);
  assert.equal(g.fridges.length, 0);
  assert.equal(g.otherHolds, 1);
  assert.equal(g.night.start, "2026-10-29 18:00");
});

test("a unit in two holds is counted once in the week", () => {
  const rows = [
    {id: "A", facility_id: "F1", facility_name: "One", start: "2026-10-30T01:00:00", end: "2026-10-30T03:00:00", kind: "EXCURSION", n: 3, unit_ids: ["U1", "U2", "U3"]},
    {id: "B", facility_id: "F1", facility_name: "One", start: "2026-10-28T01:00:00", end: "2026-10-28T03:00:00", kind: "GAP_PRESUMED", n: 2, unit_ids: ["U3", "U4"]},
  ];
  const g = groupWeek(rows);
  assert.equal(g.weekHolds, 2);
  assert.equal(g.weekUnits, 4);
  assert.equal(g.fridges[0].units, 4);
  assert.equal(g.fridges[0].cells[6].units, 3);
});

test("holds without unit ids keep their own count", () => {
  const rows = [
    {id: "A", facility_id: "F1", facility_name: "One", start: "2026-10-30T01:00:00", end: "2026-10-30T03:00:00", kind: "EXCURSION", n: 5},
    {id: "B", facility_id: "F1", facility_name: "One", start: "2026-10-30T04:00:00", end: "2026-10-30T05:00:00", kind: "EXCURSION", n: 2, unit_ids: ["X1", "X2"]},
  ];
  assert.equal(groupWeek(rows).weekUnits, 7);
});
