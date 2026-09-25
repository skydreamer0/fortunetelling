/**
 * @fileoverview Calendar conversion helpers shared by the browser form and API.
 */

import { Lunar, Solar } from 'lunar-javascript';

function pad(value) {
  return String(value).padStart(2, '0');
}

/** Convert a Gregorian date to an ISO date string. */
export function toIsoDate({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse and validate a YYYY-MM-DD date. */
export function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) throw new Error('請選擇有效的出生日期');
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('這個國曆日期不存在');
  }
  return { year, month, day };
}

/** Convert a Gregorian date to lunar input values. */
export function solarToLunarDate({ year, month, day }) {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  return {
    year: lunar.getYear(),
    month: Math.abs(lunar.getMonth()),
    day: lunar.getDay(),
    isLeap: lunar.getMonth() < 0,
  };
}

/** Convert a lunar date to Gregorian and verify it round-trips. */
export function lunarToSolarDate({ year, month, day, isLeap = false }) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error('農曆年份需在 1900–2100');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('農曆月份需在 1–12');
  }
  if (!Number.isInteger(day) || day < 1 || day > 30) {
    throw new Error('農曆日期需在 1–30');
  }

  let lunar;
  try {
    lunar = Lunar.fromYmd(year, isLeap ? -month : month, day);
  } catch {
    throw new Error(isLeap ? '該年沒有這個閏月，請重新確認' : '這個農曆日期不存在');
  }
  const solar = lunar.getSolar();
  const roundTrip = solar.getLunar();
  if (
    roundTrip.getYear() !== year
    || roundTrip.getMonth() !== (isLeap ? -month : month)
    || roundTrip.getDay() !== day
  ) {
    throw new Error('這個農曆日期不存在');
  }

  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    iso: solar.toYmd(),
  };
}
