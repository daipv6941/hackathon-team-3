import { ensureTemplateDb, markAsTemplate, startPgContainer } from '@seta/shared-testing';

let handle: Awaited<ReturnType<typeof startPgContainer>> | null = null;

export default async function (): Promise<() => Promise<void>> {
  const TEMPLATE = 'seta_template_shared_db';
  handle = await startPgContainer();
  await ensureTemplateDb(handle, TEMPLATE);
  await markAsTemplate(handle, TEMPLATE);
  process.env.SETA_TEST_PG_BASE = handle.baseUrl;
  process.env.SETA_TEST_PG_TEMPLATE = TEMPLATE;
  return async () => {
    await handle?.stop();
  };
}
