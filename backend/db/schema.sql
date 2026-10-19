--
-- PostgreSQL database dump
--

\restrict Jy6fafXntd7KTQGPzhJSLb4Liyj7M1QbbcBwjQBmdE4kSIHR1aP8gHiQ5mzKPTx

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    email character varying(254),
    phone character varying(30),
    company character varying(150),
    hourly_rate numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT clients_hourly_rate_valid CHECK (((hourly_rate >= (0)::numeric) AND (hourly_rate <> 'NaN'::numeric))),
    CONSTRAINT clients_name_valid CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 150)))
);


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.clients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.clients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    time_entry_id bigint NOT NULL,
    project_name character varying(150) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone NOT NULL,
    hourly_rate numeric(12,2) NOT NULL,
    duration_seconds numeric GENERATED ALWAYS AS (EXTRACT(epoch FROM (ended_at - started_at))) STORED,
    amount numeric GENERATED ALWAYS AS (round(((EXTRACT(epoch FROM (ended_at - started_at)) / (3600)::numeric) * hourly_rate), 2)) STORED,
    CONSTRAINT invoice_items_duration_valid CHECK ((isfinite(started_at) AND isfinite(ended_at) AND (ended_at > started_at))),
    CONSTRAINT invoice_items_rate_valid CHECK (((hourly_rate >= (0)::numeric) AND (hourly_rate <> 'NaN'::numeric)))
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.invoice_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    client_id bigint NOT NULL,
    client_name character varying(150) NOT NULL,
    client_email character varying(254),
    client_company character varying(150),
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    status character varying(10) DEFAULT 'unpaid'::character varying NOT NULL,
    issued_on date DEFAULT CURRENT_DATE NOT NULL,
    due_on date NOT NULL,
    paid_at timestamp with time zone,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT invoices_currency_valid CHECK (((currency)::text = 'INR'::text)),
    CONSTRAINT invoices_due_date_valid CHECK ((due_on >= issued_on)),
    CONSTRAINT invoices_payment_valid CHECK (((((status)::text = 'unpaid'::text) AND (paid_at IS NULL)) OR (((status)::text = 'paid'::text) AND (paid_at IS NOT NULL)))),
    CONSTRAINT invoices_status_valid CHECK (((status)::text = ANY ((ARRAY['unpaid'::character varying, 'paid'::character varying])::text[])))
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.invoices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name character varying(150) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    budget numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT projects_budget_valid CHECK (((budget >= (0)::numeric) AND (budget <> 'NaN'::numeric))),
    CONSTRAINT projects_name_valid CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 150))),
    CONSTRAINT projects_status_valid CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.projects ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    title character varying(200) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status character varying(20) DEFAULT 'todo'::character varying NOT NULL,
    due_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT tasks_status_valid CHECK (((status)::text = ANY ((ARRAY['todo'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT tasks_title_valid CHECK (((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 200)))
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tasks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tasks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    project_id bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    source character varying(10) DEFAULT 'timer'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT time_entries_duration_valid CHECK (((ended_at IS NULL) OR (ended_at > started_at))),
    CONSTRAINT time_entries_manual_finished CHECK ((((source)::text <> 'manual'::text) OR (ended_at IS NOT NULL))),
    CONSTRAINT time_entries_source_valid CHECK (((source)::text = ANY ((ARRAY['timer'::character varying, 'manual'::character varying])::text[])))
);


--
-- Name: time_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.time_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.time_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    plan character varying(10) DEFAULT 'free'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT users_email_normalized CHECK ((((email)::text = lower(TRIM(BOTH FROM email))) AND (char_length((email)::text) > 0))),
    CONSTRAINT users_name_valid CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 100))),
    CONSTRAINT users_plan_valid CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'pro'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_time_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_time_entry_id_key UNIQUE (time_entry_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: clients_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clients_user_id_idx ON public.clients USING btree (user_id);


--
-- Name: invoice_items_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);


--
-- Name: invoices_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_client_id_idx ON public.invoices USING btree (client_id);


--
-- Name: invoices_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_user_created_idx ON public.invoices USING btree (user_id, created_at DESC, id DESC);


--
-- Name: projects_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_client_id_idx ON public.projects USING btree (client_id);


--
-- Name: tasks_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_project_id_idx ON public.tasks USING btree (project_id);


--
-- Name: time_entries_one_running_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX time_entries_one_running_per_user ON public.time_entries USING btree (user_id) WHERE (ended_at IS NULL);


--
-- Name: time_entries_user_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX time_entries_user_project_idx ON public.time_entries USING btree (user_id, project_id);


--
-- Name: user_sessions_expire_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_expire_idx ON public.user_sessions USING btree (expire);


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: invoice_items invoice_items_time_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id);


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: invoices invoices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: time_entries time_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: time_entries time_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict Jy6fafXntd7KTQGPzhJSLb4Liyj7M1QbbcBwjQBmdE4kSIHR1aP8gHiQ5mzKPTx

