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
