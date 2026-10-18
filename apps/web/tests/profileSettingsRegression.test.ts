import { expect, test } from 'vitest';
import { analyze } from '../src/lib/core';
import { buildProfileDownload } from '../src/lib/profileFile';
test('non-default Web report download must retain its clock/zi choices for MCP', () => {
  const input = { year:1990,month:5,day:17,hour:23,minute:10,gender:'female' as const,name:'ALICE',
    calendarType:'solar' as const,timeKnown:true,cityId:'tainan',timeAccuracy:'exact' as const,useTrueSolarTime:false,ziHourConvention:'early' };
  const report = analyze(input);
  const download=buildProfileDownload(report,'sky');
  if(!download.ok) throw new Error(download.error);
  const file=JSON.parse(download.text);
  expect(file.settings).toEqual({useTrueSolarTime:false,ziHourConvention:'early'});
});
