/** Fail closed before building or publishing a trusted master Pages artifact. */
export interface PagesContext {
  repository: string | undefined;
  eventName: string | undefined;
  ref: string | undefined;
  sha: string | undefined;
  acceptedSha: string | undefined;
  acceptanceResult: string | undefined;
  checkoutSha: string | undefined;
  currentMasterSha: string | undefined;
  runId: string | undefined;
  runAttempt: string | undefined;
}

export function authorizePages(context: PagesContext): string {
  const require = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`Pages deployment blocked: ${message}`);
  };
  require(context.repository === 'skydreamer0/fortunetelling', 'unexpected repository');
  require(context.eventName === 'push', 'only a trusted push can publish');
  require(context.ref === 'refs/heads/master', 'only master can publish');
  require(context.acceptanceResult === 'success', 'exact-source CI acceptance must succeed');
  require(/^[0-9a-f]{40}$/.test(context.sha ?? ''), 'invalid event SHA');
  require(context.acceptedSha === context.sha, 'accepted SHA differs from event SHA');
  require(context.checkoutSha === context.sha, 'checkout differs from accepted source');
  require(context.currentMasterSha === context.sha, 'source is no longer current master');
  require(/^[1-9][0-9]*$/.test(context.runId ?? ''), 'invalid run ID');
  require(/^[1-9][0-9]*$/.test(context.runAttempt ?? ''), 'invalid run attempt');
  return `github-pages-${context.sha}-${context.runId}-${context.runAttempt}`;
}

/** A deploy-only rerun may use its earlier successful build from this same run. */
export function authorizePagesArtifact(context: PagesContext, artifactName: string | undefined, buildAttempt: string | undefined): void {
  authorizePages(context);
  if (!/^[1-9][0-9]*$/.test(buildAttempt ?? '') || BigInt(buildAttempt!) > BigInt(context.runAttempt!)) {
    throw new Error('Pages deployment blocked: invalid artifact build attempt');
  }
  if (artifactName !== `github-pages-${context.sha}-${context.runId}-${buildAttempt}`) {
    throw new Error('Pages deployment blocked: artifact provenance does not match accepted source and run');
  }
}

if (import.meta.main) {
  const context: PagesContext = {
    repository: process.env.GITHUB_REPOSITORY,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    acceptedSha: process.env.PAGES_ACCEPTED_SHA,
    acceptanceResult: process.env.PAGES_ACCEPTANCE_RESULT,
    checkoutSha: process.env.PAGES_CHECKOUT_SHA,
    currentMasterSha: process.env.PAGES_CURRENT_MASTER_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  const artifact = authorizePages(context);
  if ('PAGES_ARTIFACT_NAME' in process.env || 'PAGES_BUILD_ATTEMPT' in process.env) {
    authorizePagesArtifact(context, process.env.PAGES_ARTIFACT_NAME, process.env.PAGES_BUILD_ATTEMPT);
  }
  console.log(`Authorized exact-source Pages artifact: ${artifact}`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `artifact_name=${artifact}\n`);
  }
}
