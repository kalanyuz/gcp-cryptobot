import { AssertionError } from 'assert';

export function assertIsString(val: any): asserts val is string {
  if (typeof val !== 'string') {
    throw new AssertionError({ message: 'Not a string!' });
  }
}

export function assertIsEmpty(val: any[]): asserts val is any[] {
  if (val.length < 1) {
    throw new AssertionError({ message: 'Empty array!' });
  }
}

export function decimalPlaces(n: number) {
  const isInt = (n: number) => {
    return n == Math.round(n) && !isNaN(n);
  };

  const a = Math.abs(n);
  let c = a,
    count = 1;
  while (!isInt(c) && isFinite(c)) {
    c = a * Math.pow(10, count++);
  }
  return count - 1;
}
