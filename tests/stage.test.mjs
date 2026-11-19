import test from 'node:test';
import assert from 'node:assert/strict';
import {fitZoom, roomIndex, roomPose, scrollsWithin} from '../assets/stage.mjs';

test('the room nearest the frame is the one in view', () => {
  assert.equal(roomIndex(0, 4), 0);
  assert.equal(roomIndex(1.49, 4), 1);
  assert.equal(roomIndex(1.5, 4), 2);
  assert.equal(roomIndex(9, 4), 3);
  assert.equal(roomIndex(-2, 4), 0);
  assert.equal(roomIndex(NaN, 4), 0);
  assert.equal(roomIndex(2, 0), 0);
});

test('a room in frame, or a full room away, carries no transform', () => {
  assert.equal(roomPose(0), null);
  assert.equal(roomPose(0.003), null);
  assert.equal(roomPose(1), null);
  assert.equal(roomPose(-2), null);
});

test('rooms turn away from the frame on their own side and fade as they leave', () => {
  const right = roomPose(0.5), left = roomPose(-0.5);
  assert.match(right.transform, /rotateY\(12\.00deg\)/);
  assert.match(left.transform, /rotateY\(-12\.00deg\)/);
  assert.equal(right.opacity, left.opacity);
  assert.ok(Number(roomPose(0.9).opacity) < Number(roomPose(0.1).opacity));
});

test('rooms shrink to fit the frame but never below the legible floor', () => {
  assert.equal(fitZoom(600, 500), 1);
  assert.equal(fitZoom(450, 500), 0.9);
  assert.equal(fitZoom(100, 500), 0.7);
  assert.equal(fitZoom(0, 500), 1);
  assert.equal(fitZoom(300, 0), 1);
});

test('the wheel only turns the stage when nothing under it can still scroll', () => {
  const boundary = {};
  const list = {scrollHeight: 400, clientHeight: 200, scrollTop: 0, parentElement: boundary};
  const row = {scrollHeight: 20, clientHeight: 20, scrollTop: 0, parentElement: list};
  const auto = () => ({overflowY: 'auto'});
  assert.equal(scrollsWithin(row, boundary, 1, auto), true);
  assert.equal(scrollsWithin(row, boundary, -1, auto), false);
  list.scrollTop = 200;
  assert.equal(scrollsWithin(row, boundary, 1, auto), false);
  assert.equal(scrollsWithin(row, boundary, -1, auto), true);
  assert.equal(scrollsWithin(row, boundary, -1, () => ({overflowY: 'visible'})), false);
});
