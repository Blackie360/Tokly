-- Table owners must not bypass tenant isolation during app-server queries.
ALTER TABLE "agent_activity_events" FORCE ROW LEVEL SECURITY;
