import { deviceStorage } from './client';
import { offlineSnapshots } from './offline-snapshots';
export const offline = offlineSnapshots(deviceStorage);
