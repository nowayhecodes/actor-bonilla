import { randomUUID } from 'crypto';

export default () => {
  return randomUUID().toLowerCase();
};