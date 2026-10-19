import type { SystemCheck } from '@planner/shared';
import { Activity } from 'lucide-react';
import { errorMessage } from '../../api/client';
import { useSystemChecks } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { FormError } from '../ui/Form';
import styles from './SystemCheckCard.module.css';

const STATUS_LABEL: Record<SystemCheck['status'], string> = {
  ok: 'Working',
  warning: 'Check',
  error: 'Not working',
  missing: 'Not set up',
};

/** Tests the database, scheduler and each outside service with the server's real keys. */
export function SystemCheckCard() {
  const checks = useSystemChecks();

  return (
    <Card
      title="System check"
      action={
        <Button
          size="sm"
          icon={<Activity size={14} />}
          loading={checks.isFetching}
          onClick={() => void checks.refetch()}
        >
          {checks.data ? 'Run again' : 'Run checks'}
        </Button>
      }
    >
      {checks.error && <FormError message={errorMessage(checks.error)} />}
      {!checks.data ? (
        <p className={styles.intro}>
          Checks that the database, the reminder scheduler, Gmail, Twilio WhatsApp and Spotify are
          connected and their keys are accepted.
        </p>
      ) : (
        <ul className={styles.list}>
          {checks.data.map((check) => (
            <li key={check.key} className={styles.row}>
              <span className={`${styles.dot} ${styles[check.status]}`} aria-hidden />
              <div className={styles.text}>
                <div className={styles.head}>
                  <span className={styles.label}>{check.label}</span>
                  <span className={`${styles.badge} ${styles[check.status]}`}>
                    {STATUS_LABEL[check.status]}
                  </span>
                </div>
                <p className={styles.detail}>{check.detail}</p>
                {check.fix && <p className={styles.fix}>{check.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
