import * as cron from 'node-cron';
import { generateWeeklyReport } from './generateWeeklyReport';

export function startWeeklyReportScheduler(): void {
  cron.schedule(
    '0 8 * * 1',
    () => {
      console.log('🚀 Запуск еженедельного отчета...');
      generateWeeklyReport().catch(console.error);
    },
    {
      timezone: 'Europe/Moscow',
    }
  );
}
