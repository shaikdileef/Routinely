import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/Feedback';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={<Link to="/">Back to dashboard</Link>}
      />
    </Card>
  );
}
