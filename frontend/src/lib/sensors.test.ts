import { expect, it } from 'vitest'
import { relativeWetnessIndex, measurementLabel, wetnessValue, formatWetness } from './sensors'
it('derives only a bounded relative reference index, without changing raw readings', () => {
  expect(relativeWetnessIndex(561)).toBe(0)
  expect(relativeWetnessIndex(223)).toBe(100)
  expect(relativeWetnessIndex(392)).toBe(50)
  expect(relativeWetnessIndex(0)).toBe(100)
  expect(relativeWetnessIndex(1023)).toBe(0)
  expect(relativeWetnessIndex(Number.NaN)).toBeNull()
  expect(measurementLabel('soil-moisture-raw')).toBe('Relative Wetness (%)')
})

it('formats display values without re-converting percentage readings', () => {
  expect(wetnessValue(392, 'adc')).toBe(50)
  expect(wetnessValue(40, '%')).toBe(40)
  expect(wetnessValue(40, 'unsupported')).toBeNull()
  expect(formatWetness(50)).toBe('50%')
})
