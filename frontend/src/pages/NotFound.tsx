import EmptyState from '../components/ui/EmptyState';
import { SearchIcon } from '../components/ui/icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <EmptyState
      className="min-h-[50vh]"
      icon={<SearchIcon className="h-6 w-6" />}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={{ label: 'Back to home', to: '/' }}
    />
  );
}
