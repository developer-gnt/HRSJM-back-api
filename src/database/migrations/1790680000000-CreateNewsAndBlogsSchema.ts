import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsAndBlogsSchema1790680000000 implements MigrationInterface {
  name = 'CreateNewsAndBlogsSchema1790680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create news table
    await queryRunner.query(`
      CREATE TABLE "news" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "title" character varying(255) NOT NULL,
        "slug" character varying(255),
        "summary" text NOT NULL,
        "summary_detailed" text,
        "content" text,
        "category" character varying(100) NOT NULL DEFAULT 'General',
        "status" character varying(30) NOT NULL DEFAULT 'PUBLISHED',
        "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "views" integer NOT NULL DEFAULT 0,
        "thumbnail_url" text,
        "author" character varying(100) NOT NULL DEFAULT 'HRSJM Team',
        "tags" text,
        "highlights" text,
        "gallery" text,
        "allow_comments" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_news" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_news_status" ON "news" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_news_category" ON "news" ("category")`);
    await queryRunner.query(`CREATE INDEX "idx_news_published_at" ON "news" ("published_at")`);
    await queryRunner.query(`CREATE INDEX "idx_news_slug" ON "news" ("slug")`);

    // 2. Create blogs table
    await queryRunner.query(`
      CREATE TABLE "blogs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid,
        "updated_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "deleted_by" uuid,
        "title" character varying(255) NOT NULL,
        "slug" character varying(255),
        "excerpt" text NOT NULL,
        "content" text,
        "category" character varying(100) NOT NULL DEFAULT 'General',
        "status" character varying(30) NOT NULL DEFAULT 'PUBLISHED',
        "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "views" integer NOT NULL DEFAULT 0,
        "thumbnail_url" text,
        "author" character varying(100) NOT NULL DEFAULT 'HRSJM Admin',
        "tags" text,
        "featured" boolean NOT NULL DEFAULT false,
        "allow_comments" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_blogs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_blogs_status" ON "blogs" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_blogs_category" ON "blogs" ("category")`);
    await queryRunner.query(`CREATE INDEX "idx_blogs_published_at" ON "blogs" ("published_at")`);
    await queryRunner.query(`CREATE INDEX "idx_blogs_slug" ON "blogs" ("slug")`);

    // 3. Seed permissions for news & blogs
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "name", "description") VALUES
        (uuid_generate_v4(), 'news.read', 'View news items'),
        (uuid_generate_v4(), 'news.create', 'Create news items'),
        (uuid_generate_v4(), 'news.manage', 'Edit, publish or delete news items'),
        (uuid_generate_v4(), 'blogs.read', 'View blog articles'),
        (uuid_generate_v4(), 'blogs.create', 'Create blog articles'),
        (uuid_generate_v4(), 'blogs.manage', 'Edit, publish or delete blog articles')
      ON CONFLICT ("name") DO NOTHING
    `);

    // 4. Seed initial News
    await queryRunner.query(`
      INSERT INTO "news" (
        "id", "title", "slug", "summary", "summary_detailed", "content", "category", "status",
        "published_at", "views", "thumbnail_url", "author", "tags", "highlights"
      ) VALUES
      (
        '20000000-0000-0000-0000-000000000001',
        'HRSJM Organizes Legal Aid Camp in Kurla',
        'hrsjm-organizes-legal-aid-camp-in-kurla',
        'Free legal consultation camp held for community members.',
        'HRSJM organized a legal aid camp in Kurla to provide free legal consultation and support to community members. The initiative aimed to create awareness about legal rights and assist individuals in getting proper guidance.',
        'The Human Rights & Social Justice Mission (HRSJM) organized a legal aid camp in Kurla, Mumbai, to provide free legal consultation and support to community members.\n\nThe camp witnessed a large turnout, with people from different sections of society seeking guidance on issues related to property disputes, labour rights, domestic violence, and other legal matters.\n\nHRSJM volunteers and legal professionals provided information about available legal remedies, government schemes, and fundamental rights.\n\nThe initiative focused on improving legal awareness and helping community members understand the appropriate channels for seeking assistance.',
        'Legal',
        'PUBLISHED',
        '2026-09-28 16:30:00+05:30',
        1200,
        'https://picsum.photos/seed/hrsjm-news-01/400/300',
        'HRSJM Team',
        'Legal Aid,Community Support,Kurla,Human Rights',
        'Free legal consultation by experienced lawyers,Awareness on fundamental rights,Support for women, workers and marginalized communities,Guidance on government schemes and legal processes'
      ),
      (
        '20000000-0000-0000-0000-000000000002',
        'Supreme Court Highlights Importance of Human Rights',
        'supreme-court-highlights-importance-of-human-rights',
        'Key observations on protection of fundamental rights.',
        'Key observations on protection of fundamental rights and constitutional liberties across all judicial branches.',
        'The Supreme Court recently reiterated the indispensable nature of human rights protections in ensuring democratic accountability and personal freedoms.',
        'Legal Update',
        'PUBLISHED',
        '2026-09-24 11:15:00+05:30',
        980,
        'https://picsum.photos/seed/hrsjm-news-02/400/300',
        'HRSJM Team',
        'Legal Update,Supreme Court,Human Rights',
        'Focus on constitutional protections,Guidelines for law enforcement'
      ),
      (
        '20000000-0000-0000-0000-000000000003',
        'Relief Support Provided to Flood-Affected Families',
        'relief-support-provided-to-flood-affected-families',
        'HRSJM distributes essential supplies to affected families.',
        'HRSJM distributes essential supplies including dry rations, clean water, and hygiene kits to flood-affected families.',
        'Volunteer teams worked tirelessly across eastern suburbs to distribute critical supplies and provide emergency shelter assistance.',
        'Relief Work',
        'PUBLISHED',
        '2026-09-20 14:20:00+05:30',
        1500,
        'https://picsum.photos/seed/hrsjm-news-03/400/300',
        'HRSJM Team',
        'Relief,Floods,Community Support',
        'Over 500 kits delivered,Volunteer teams on ground'
      ),
      (
        '20000000-0000-0000-0000-000000000004',
        'Know Your Rights: Arrest and Bail Process',
        'know-your-rights-arrest-and-bail-process',
        'Important information on your rights during arrest.',
        'Comprehensive guide on legal safeguards, notification of grounds of arrest, and bail application procedures.',
        'Citizens must be aware of their rights during interactions with law enforcement, including the right to legal counsel and timely magistrate presentation.',
        'Know Your Rights',
        'PUBLISHED',
        '2026-09-18 10:00:00+05:30',
        2100,
        'https://picsum.photos/seed/hrsjm-news-04/400/300',
        'HRSJM Team',
        'Know Your Rights,Bail,Legal Advice',
        'Constitutional guarantees,Step-by-step procedures'
      ),
      (
        '20000000-0000-0000-0000-000000000005',
        'HRSJM Conducts Awareness Session at Local School',
        'hrsjm-conducts-awareness-session-at-local-school',
        'Interactive session on child rights and safety.',
        'Interactive session on child rights and safety conducted for students and teachers at a local school.',
        'HRSJM volunteers conducted an interactive awareness session covering child rights, personal safety and available support systems.',
        'Awareness',
        'DRAFT',
        '2026-09-15 15:05:00+05:30',
        0,
        'https://picsum.photos/seed/hrsjm-news-05/400/300',
        'Admin',
        'Awareness,Child Rights,School,Safety',
        'Interactive session with students,Safety protocols explained'
      ),
      (
        '20000000-0000-0000-0000-000000000006',
        'Environmental Justice Initiative Launched',
        'environmental-justice-initiative-launched',
        'Campaign to address environmental issues in urban communities.',
        'Community campaign targeting clean water, waste reduction, and urban green spaces in underserved settlements.',
        'Our environmental team launched the urban justice initiative to engage neighborhood groups in sustainable civic action.',
        'Environment',
        'PUBLISHED',
        '2026-09-12 13:20:00+05:30',
        890,
        'https://picsum.photos/seed/hrsjm-news-06/400/300',
        'HRSJM Team',
        'Environment,Sustainability,Community',
        'Urban greening projects,Clean water advocacy'
      ),
      (
        '20000000-0000-0000-0000-000000000007',
        'Blood Donation Drive a Huge Success',
        'blood-donation-drive-a-huge-success',
        'More than 150 people donated blood at HRSJM camp.',
        'More than 150 people donated blood at the HRSJM blood donation camp conducted with volunteer medical professionals.',
        'The camp witnessed great enthusiasm from youth and community volunteers who came forward to support local blood banks.',
        'Health',
        'ARCHIVED',
        '2026-09-08 12:20:00+05:30',
        720,
        'https://picsum.photos/seed/hrsjm-news-07/400/300',
        'Admin',
        'Blood Donation,Health Camp,Volunteers',
        '150+ donors,Free health screenings'
      ),
      (
        '20000000-0000-0000-0000-000000000008',
        'HRSJM Raises Concern on Recent Policy Changes',
        'hrsjm-raises-concern-on-recent-policy-changes',
        'Press conference highlights changing policies affecting communities.',
        'HRSJM leadership addressed media representatives on policies impacting informal workers and housing security.',
        'Policy recommendations were submitted to municipal authorities to protect vulnerable tenant rights and livelihood opportunities.',
        'Advocacy',
        'PUBLISHED',
        '2026-09-04 18:00:00+05:30',
        1100,
        'https://picsum.photos/seed/hrsjm-news-08/400/300',
        'HRSJM Team',
        'Advocacy,Policy,Press Conference',
        'Memorandum submitted,Key demands articulated'
      )
      ON CONFLICT ("id") DO NOTHING;
    `);

    // 5. Seed initial Blogs
    await queryRunner.query(`
      INSERT INTO "blogs" (
        "id", "title", "slug", "excerpt", "content", "category", "status",
        "published_at", "views", "thumbnail_url", "author", "tags", "featured"
      ) VALUES
      (
        '30000000-0000-0000-0000-000000000001',
        'Understanding Your Legal Rights as a Citizen',
        'understanding-your-legal-rights-as-a-citizen',
        'A simple guide to fundamental rights every citizen should know.',
        'Every citizen has fundamental rights that protect their freedom, dignity and equality. Understanding these rights helps individuals participate actively in a democratic society and seek justice when needed.\n\nIn this blog, we explore the key constitutional rights, their importance in daily life, and how citizens can make informed decisions to safeguard their rights.',
        'Know Your Rights',
        'PUBLISHED',
        '2026-09-28 16:30:00+05:30',
        2100,
        'https://picsum.photos/seed/hrsjm-blog-01/400/300',
        'HRSJM Admin',
        'Know Your Rights,Citizenship,Constitution,Legal Awareness',
        true
      ),
      (
        '30000000-0000-0000-0000-000000000002',
        'The Importance of Community Support',
        'the-importance-of-community-support',
        'How collective action creates stronger and more supportive communities.',
        'Strong communities are built on mutual support and collective responsibility. When people come together, they can overcome challenges that no individual could face alone.\n\nThis blog looks at how community networks strengthen social justice, and how small acts of solidarity create lasting change in neighbourhoods.',
        'Social Justice',
        'PUBLISHED',
        '2026-09-24 11:15:00+05:30',
        1900,
        'https://picsum.photos/seed/hrsjm-blog-02/400/300',
        'HRSJM Admin',
        'Community,Social Justice,Solidarity',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000003',
        'Relief Efforts for Flood-Affected Families',
        'relief-efforts-for-flood-affected-families',
        'HRSJM''s on-ground work to support affected families.',
        'When floods affect a region, timely relief can make the difference between recovery and prolonged hardship. HRSJM teams work alongside affected families from day one.\n\nThis update covers our on-ground relief efforts, the supplies distributed, and how volunteers coordinated with local authorities to reach the families who needed help most.',
        'Relief Work',
        'PUBLISHED',
        '2026-09-20 14:40:00+05:30',
        1800,
        'https://picsum.photos/seed/hrsjm-blog-03/400/300',
        'HRSJM Admin',
        'Relief Work,Flood Response,Volunteers',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000004',
        'Child Rights and Education for All',
        'child-rights-and-education-for-all',
        'Every child deserves access to education, safety and opportunity.',
        'Education is the foundation of opportunity, yet millions of children remain out of school due to poverty, displacement and social barriers.\n\nThis draft explores how child rights and access to education go hand in hand, and what communities can do to keep every child learning.',
        'Education',
        'DRAFT',
        '2026-09-15 10:00:00+05:30',
        320,
        'https://picsum.photos/seed/hrsjm-blog-04/400/300',
        'HRSJM Admin',
        'Child Rights,Education,Learning',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000005',
        'Protecting Our Environment Together',
        'protecting-our-environment-together',
        'Environmental justice is essential for healthier communities.',
        'Environmental justice means every community deserves clean air, safe water and a healthy place to live, regardless of income or background.\n\nHere we share practical steps our teams and volunteers are taking to protect local ecosystems and build healthier, more sustainable neighbourhoods.',
        'Environment',
        'PUBLISHED',
        '2026-09-12 13:20:00+05:30',
        980,
        'https://picsum.photos/seed/hrsjm-blog-05/400/300',
        'HRSJM Admin',
        'Environment,Sustainability,Green Living',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000006',
        'Empowering Women Through Legal Awareness',
        'empowering-women-through-legal-awareness',
        'Creating awareness and access to justice for women.',
        'Legal awareness is often the first step towards justice for women facing discrimination or violence. Knowing their rights empowers women to seek help with confidence.\n\nThis blog outlines the key legal protections available to women and how HRSJM''s awareness programmes are making them accessible at the grassroots level.',
        'Women Rights',
        'PUBLISHED',
        '2026-09-08 12:10:00+05:30',
        1200,
        'https://picsum.photos/seed/hrsjm-blog-06/400/300',
        'HRSJM Admin',
        'Women Rights,Legal Awareness,Empowerment',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000007',
        'How to File a Complaint: A Step-by-Step Guide',
        'how-to-file-a-complaint-a-step-by-step-guide',
        'A complete guide to help you file a complaint with confidence.',
        'Filing a complaint can feel overwhelming, especially when you are unfamiliar with the process. A clear, step-by-step approach removes much of that uncertainty.\n\nThis archived guide walks through each stage of filing a complaint, from gathering evidence to following up, so you can act with confidence.',
        'Guides',
        'ARCHIVED',
        '2026-09-04 17:00:00+05:30',
        640,
        'https://picsum.photos/seed/hrsjm-blog-07/400/300',
        'HRSJM Admin',
        'Complaints,Guides,Step-by-Step',
        false
      ),
      (
        '30000000-0000-0000-0000-000000000008',
        'Highlights from HRSJM''s Community Outreach Program',
        'highlights-from-hrsjms-community-outreach-program',
        'A look back at our recent outreach and community impact.',
        'Our recent community outreach programme brought together volunteers, families and local partners for a day of service, learning and connection.\n\nThis look back at the programme highlights the activities conducted, the people reached, and the moments that made the outreach memorable.',
        'Events',
        'PUBLISHED',
        '2026-08-28 15:45:00+05:30',
        1600,
        'https://picsum.photos/seed/hrsjm-blog-08/400/300',
        'HRSJM Admin',
        'Outreach,Community,HRSJM',
        false
      )
      ON CONFLICT ("id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "blogs"`);
    await queryRunner.query(`DROP TABLE "news"`);
  }
}
