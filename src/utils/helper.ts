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
