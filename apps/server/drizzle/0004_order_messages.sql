CREATE TABLE "order_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"template" text,
	"photo_url" text,
	"lat" double precision,
	"lng" double precision,
	"staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_messages_order_idx" ON "order_messages" USING btree ("order_id","created_at");