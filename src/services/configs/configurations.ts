import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

export default () => {
  return yaml.load(
    readFileSync(join(__dirname, process.env.CONFIGFILE), 'utf8'),
  ) as Record<string, any>;
};
