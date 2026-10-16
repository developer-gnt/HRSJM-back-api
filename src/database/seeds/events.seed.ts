import dataSource from '../data-source';
import { EventEntity, EventStatus } from '../../modules/events/entities/event.entity';

const SEED_EVENTS = [
  {
    title: 'Legal Awareness Workshop for Citizens',
    description:
      'An interactive session to create awareness about fundamental rights, legal protections and practical steps to seek justice.',
    short_information: 'Interactive legal workshop covering fundamental rights and practical remedies.',
    category: 'Workshop',
    event_type: 'IN_PERSON',
    cover_image_url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
    start_at: new Date('2026-10-18T10:00:00+05:30'),
    end_at: new Date('2026-10-18T13:00:00+05:30'),
    all_day: false,
    location: 'Mumbai, Maharashtra',
    address: 'HRSJM Community Hall, Dadar, Mumbai 400014',
    organized_by: 'HRSJM Legal Cell',
    registration_required: true,
    capacity: 150,
    registrations: 38,
    per_person_limit: 1,
    target_audience: 'General Citizens & Youth',
    language: 'Hindi & English',
    tags: ['Workshop', 'Legal Awareness'],
    status: EventStatus.UPCOMING,
  },
  {
    title: 'Women’s Rights and Safety Awareness Program',
    description:
      'A community program focused on women’s rights, personal safety and practical ways to access legal and emotional support.',
    short_information: 'Awareness program on legal protections, safety helplines and crisis intervention.',
    category: 'Awareness',
    event_type: 'IN_PERSON',
    cover_image_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80',
    start_at: new Date('2026-11-12T11:00:00+05:30'),
    end_at: new Date('2026-11-12T14:00:00+05:30'),
    all_day: false,
    location: 'Pune, Maharashtra',
    address: 'Community Learning Centre, Shivajinagar, Pune 411005',
    organized_by: 'HRSJM Women Wing',
    registration_required: true,
    capacity: 200,
    registrations: 65,
    per_person_limit: 1,
    target_audience: 'Women & Families',
    language: 'Marathi & Hindi',
    tags: ['Awareness', 'Women’s Rights'],
    status: EventStatus.UPCOMING,
  },
  {
    title: 'Community Outreach & Legal Rights Drive',
    description:
      'Join local volunteers for a community outreach activity connecting residents with essential rights, welfare schemes and resources.',
    short_information: 'Field activity connecting vulnerable residents to government welfare schemes.',
    category: 'Community',
    event_type: 'IN_PERSON',
    cover_image_url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80',
    start_at: new Date('2026-12-05T09:00:00+05:30'),
    end_at: new Date('2026-12-05T12:00:00+05:30'),
    all_day: false,
    location: 'Navi Mumbai, Maharashtra',
    address: 'HRSJM Community Centre, Sector 17, Vashi, Navi Mumbai 400703',
    organized_by: 'HRSJM Field Team',
    registration_required: true,
    capacity: 100,
    registrations: 22,
    per_person_limit: 1,
    target_audience: 'Residents & Volunteers',
    language: 'Hindi & Marathi',
    tags: ['Community', 'Field Activity'],
    status: EventStatus.UPCOMING,
  },
  {
    title: 'Right to Education – Student Awareness Session',
    description:
      'An awareness session for students and families on constitutional right to education and available government learning support.',
    short_information: 'Student rights workshop on RTE Act protections, scholarships and admissions.',
    category: 'Education',
    event_type: 'IN_PERSON',
    cover_image_url: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=800&q=80',
    start_at: new Date('2026-12-18T10:00:00+05:30'),
    end_at: new Date('2026-12-18T12:00:00+05:30'),
    all_day: false,
    location: 'Thane, Maharashtra',
    address: 'HRSJM Learning Centre, Station Road, Thane West 400601',
    organized_by: 'HRSJM Youth Education Cell',
    registration_required: true,
    capacity: 120,
    registrations: 45,
    per_person_limit: 1,
    target_audience: 'Students & Parents',
    language: 'English & Hindi',
    tags: ['Education', 'Children’s Rights'],
    status: EventStatus.UPCOMING,
  },
];

async function seedEvents(): Promise<void> {
  console.log('--- Initializing database connection for event seeding ---');
  await dataSource.initialize();
  const repo = dataSource.getRepository(EventEntity);

  for (const item of SEED_EVENTS) {
    const existing = await repo.findOne({ where: { title: item.title } });
    if (!existing) {
      const created = repo.create(item);
      await repo.save(created);
      console.log(`[SEED] Created upcoming event: ${item.title}`);
    } else {
      // Update dates and status so they are currently UPCOMING
      existing.start_at = item.start_at;
      existing.end_at = item.end_at;
      existing.status = item.status;
      existing.cover_image_url = item.cover_image_url;
      existing.category = item.category;
      existing.tags = item.tags;
      await repo.save(existing);
      console.log(`[SEED] Updated upcoming event: ${item.title}`);
    }
  }

  await dataSource.destroy();
  console.log('--- Event seeding completed successfully ---');
}

seedEvents().catch((err) => {
  console.error('Failed to seed events:', err);
  process.exit(1);
});
