CREATE ROLE tokly_app LOGIN PASSWORD 'tokly';
ALTER DATABASE tokly OWNER TO tokly_app;
ALTER SCHEMA public OWNER TO tokly_app;
GRANT ALL ON SCHEMA public TO tokly_app;
