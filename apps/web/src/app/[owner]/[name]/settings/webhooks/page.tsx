import { RepositoryWebhooksPanel } from "@/components/RepositoryWebhooksPanel";

type RepositoryWebhooksPageProps = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function RepositoryWebhooksPage({ params }: RepositoryWebhooksPageProps) {
  const { owner, name } = await params;
  return <RepositoryWebhooksPanel name={decodeURIComponent(name)} owner={decodeURIComponent(owner)} />;
}
