# Odenta Frontend Documentation

> **Version:** 1.0.0 (MVP)  
> **Last Updated:** February 14, 2026  
> **Status:** Production-Ready (Mock Data)

---

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Features](#features)
5. [Setup & Installation](#setup--installation)
6. [Configuration](#configuration)
7. [Routing & Navigation](#routing--navigation)
8. [State Management](#state-management)
9. [Data Layer](#data-layer)
10. [UI Components](#ui-components)
11. [Deployment](#deployment)
12. [Future Enhancements](#future-enhancements)

---

## Overview

**Odenta** is a comprehensive dental practice management system designed for dentists in Uzbekistan. The frontend is a modern, responsive web application built with Next.js 14, providing a complete suite of tools for patient management, appointment scheduling, treatment tracking, and financial management.

### Key Highlights

- **Multi-tenant architecture** (prepared for backend integration)
- **Responsive design** (mobile, tablet, desktop)
- **Modern UI/UX** with shadcn/ui components
- **Real-time interactions** with optimistic updates
- **Super admin panel** for platform management

---

## Technology Stack

### Core Framework
- **Next.js 14** - React framework with App Router
- **React 18** - UI library
- **TypeScript** - Type safety

### UI & Styling
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

### State & Data Management
- **Zustand** - Lightweight state management
- **date-fns** - Date manipulation library
- **Mock Data Layer** - Simulated backend (temporary)

### Development Tools
- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **TypeScript** - Static type checking

---

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication routes
│   │   ├── login/               # Dentist login
│   │   └── register/            # Dentist registration
│   ├── admin/                    # Super admin panel
│   │   ├── login/               # Admin login
│   │   ├── settings/            # Admin settings
│   │   └── page.tsx             # Admin dashboard
│   ├── appointments/            # Appointment scheduling
│   ├── dashboard/               # Main dashboard
│   ├── patients/                # Patient management
│   │   └── [id]/               # Patient detail pages
│   ├── payments/                # Payment tracking
│   ├── settings/                # Dentist settings
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Landing page
├── components/
│   ├── layout/                  # Layout components
│   │   └── app-layout.tsx      # Main app layout with nav
│   ├── odontogram/              # Odontogram components
│   │   ├── tooth-chart.tsx     # 32-tooth interactive chart
│   │   └── tooth-detail-modal.tsx
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── mock-data.ts            # Mock data for all features
│   ├── store.ts                # Zustand state management
│   ├── types.ts                # TypeScript type definitions
│   └── utils.ts                # Utility functions
├── public/                      # Static assets
└── styles/                      # Global styles
```

---

## Features

### 1. **Dashboard** (`/dashboard`)

**Purpose:** Overview of practice performance and daily activities

**Key Metrics:**
- Revenue this month (UZS)
- Outstanding debt total
- Today's appointments count

**Components:**
- Stat cards with trend indicators
- Today's appointments list
- Quick action buttons

**Mock Data:** `mockDashboardStats`, `mockAppointments`

---

### 2. **Patient Management** (`/patients`)

**Purpose:** Comprehensive patient record management

**Features:**
- **Patient List:** Searchable table with name, phone, last visit
- **Add Patient:** Modal form with validation
- **Patient Detail:** Full profile with odontogram, appointments, invoices
- **Search & Filter:** Real-time search by name/phone

**Data Structure:**
```typescript
interface Patient {
  id: string;
  name: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  medicalHistory?: string;
  allergies?: string;
  lastVisit?: string;
}
```

**Mock Data:** `mockPatients` (15 sample patients)

---

### 3. **Interactive Odontogram** (`/patients/[id]`)

**Purpose:** Visual tooth chart for treatment tracking

**Features:**
- **32-tooth chart** (Universal Numbering System)
- **Color-coded conditions:**
  - 🟢 Healthy (green)
  - 🔴 Cavity (red)
  - 🟡 Filled (yellow)
  - ⚫ Missing (gray)
  - 🔵 Crown (blue)
  - 🟣 Root Canal (purple)
- **Click tooth → Detail modal** with treatment history
- **Add/Edit treatments** with date and notes
- **Mobile-responsive** grid layout

**Data Structure:**
```typescript
interface ToothCondition {
  toothNumber: number;
  condition: 'healthy' | 'cavity' | 'filled' | 'missing' | 'crown' | 'root_canal';
  notes?: string;
  date: string;
  treatmentHistory?: Treatment[];
}
```

**Mock Data:** `mockOdontograms` (per patient)

---

### 4. **Appointment Scheduling** (`/appointments`)

**Purpose:** Calendar-based appointment management

**Features:**
- **Day View:** Hourly time slots (8 AM - 6 PM)
- **Week View:** 7-day calendar grid
- **30-minute intervals**
- **New Appointment Modal:** Patient selection, date/time, treatment type
- **Appointment Details:** Click to view/edit
- **Status indicators:** Scheduled, Completed, Cancelled

**Data Structure:**
```typescript
interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  treatmentType: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}
```

**Mock Data:** `mockAppointments` (20+ appointments)

---

### 5. **Payment Tracking** (`/payments`)

**Purpose:** Invoice and payment management

**Features:**
- **Outstanding Invoices Table:** Patient, amount, due date, status
- **Payment Summary Cards:** Total outstanding, paid this month, overdue count
- **Record Payment Modal:** Partial or full payment
- **Search & Filter:** By patient name or status
- **Status badges:** Paid, Partial, Overdue, Pending

**Data Structure:**
```typescript
interface Invoice {
  id: string;
  patientId: string;
  patientName: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'paid' | 'partial' | 'overdue' | 'pending';
  description: string;
  createdAt: string;
}
```

**Mock Data:** `mockInvoices`, `mockPayments`

---

### 6. **Dentist Settings** (`/settings`)

**Purpose:** Practice and profile management

**Tabs:**
1. **Personal Information**
   - Name (with "Dr." prefix)
   - Email
   - Phone
   - Practice name

2. **Practice Settings**
   - Practice name
   - Address
   - License number
   - Working hours

3. **Security**
   - Change password
   - Two-factor authentication (placeholder)

**Mock Data:** `mockDentistProfile`

---

### 7. **Authentication**

#### Dentist Authentication
- **Login** (`/login`): Google OAuth (mock)
- **Registration** (`/register`): Practice setup form
- **Session Management:** Zustand store

#### Admin Authentication
- **Admin Login** (`/admin/login`): Email/password
- **Demo Credentials:** `admin@odenta.uz` / `admin123`

---

### 8. **Super Admin Panel** (`/admin`)

**Purpose:** Platform-wide dentist account management

**Features:**

#### Admin Dashboard
- **Metrics:**
  - Total dentists: 5
  - Active dentists: 4 (80%)
  - New registrations (last 7 days): 2

#### Dentist Account Management
- **Table Columns:** Name, Email, Practice, Registration Date, Status, Last Login
- **Search:** Real-time search across all fields
- **Actions:**
  - ✅ Block/Unblock account
  - ✅ Reset password (sends email)
  - ✅ Soft delete account
  - ✅ Create new dentist account

#### Create Dentist Modal
- **Fields:** Name, Email, Practice Name, Initial Password
- **Validation:** Email format, password min 8 chars
- **Auto-prefix:** "Dr." added automatically

#### Admin Settings (`/admin/settings`)
- **Profile Tab:** Name, email
- **Security Tab:** Password change

**Mock Data:** `mockDentistAccounts`, `mockAdminStats`

---

## Setup & Installation

### Prerequisites
- **Node.js:** 18.x or higher
- **npm:** 9.x or higher

### Installation Steps

```bash
# 1. Navigate to frontend directory
cd dentalflow/frontend

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev

# 4. Open browser
# Navigate to http://localhost:3000
```

### Build for Production

```bash
# Create optimized production build
npm run build

# Start production server
npm start
```

---

## Configuration

### Environment Variables

Create `.env.local` file:

```env
# API Configuration (for future backend integration)
NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Google OAuth (for future integration)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here

# App Configuration
NEXT_PUBLIC_APP_NAME=Odenta
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Tailwind Configuration

Custom colors and theme defined in `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    colors: {
      border: "hsl(var(--border))",
      input: "hsl(var(--input))",
      ring: "hsl(var(--ring))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      // ... shadcn/ui color system
    }
  }
}
```

---

## Routing & Navigation

### Public Routes
- `/` - Landing page
- `/login` - Dentist login
- `/register` - Dentist registration
- `/admin/login` - Admin login

### Protected Routes (Dentist)
- `/dashboard` - Main dashboard
- `/patients` - Patient list
- `/patients/[id]` - Patient detail
- `/appointments` - Appointment calendar
- `/payments` - Payment tracking
- `/settings` - Dentist settings

### Protected Routes (Admin)
- `/admin` - Admin dashboard
- `/admin/settings` - Admin settings

### Navigation Component

**Location:** `components/layout/app-layout.tsx`

**Features:**
- Responsive sidebar (desktop) / bottom nav (mobile)
- Active route highlighting
- User menu with logout
- Avatar with initials

**Menu Items:**
```typescript
[
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Patients', href: '/patients', icon: Users },
  { name: 'Appointments', href: '/appointments', icon: Calendar },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  { name: 'Settings', href: '/settings', icon: Settings },
]
```

---

## State Management

### Zustand Store (`lib/store.ts`)

**Authentication State:**
```typescript
interface AuthState {
  isAuthenticated: boolean;
  dentistName: string | null;
  login: (name: string) => void;
  logout: () => void;
}
```

**Usage:**
```typescript
import { useAuthStore } from '@/lib/store';

const { isAuthenticated, dentistName, login, logout } = useAuthStore();
```

**Persistence:** LocalStorage (automatic)

---

## Data Layer

### Mock Data (`lib/mock-data.ts`)

All data is currently mocked for frontend development. Backend integration will replace these with API calls.

**Available Mock Data:**
- `mockPatients` - 15 patients
- `mockAppointments` - 20+ appointments
- `mockInvoices` - 12 invoices
- `mockPayments` - Payment records
- `mockOdontograms` - Tooth charts per patient
- `mockDentistProfile` - Dentist profile
- `mockDashboardStats` - Dashboard metrics
- `mockDentistAccounts` - Admin panel data
- `mockAdminStats` - Admin metrics

### Type Definitions (`lib/types.ts`)

All TypeScript interfaces are centralized:
- `Patient`
- `Appointment`
- `Invoice`
- `Payment`
- `ToothCondition`
- `Treatment`
- `DentistProfile`
- `DentistAccount`
- `AccountStatus`

---

## UI Components

### shadcn/ui Components Used

**Installed Components:**
- `button` - Primary actions
- `card` - Content containers
- `input` - Form inputs
- `label` - Form labels
- `table` - Data tables
- `dialog` - Modals
- `dropdown-menu` - Action menus
- `badge` - Status indicators
- `tabs` - Tabbed interfaces
- `textarea` - Multi-line inputs
- `avatar` - User avatars
- `calendar` - Date pickers

### Custom Components

**Odontogram Components:**
- `ToothChart` - 32-tooth interactive grid
- `ToothDetailModal` - Treatment history modal

**Layout Components:**
- `AppLayout` - Main app wrapper with navigation

---

## Deployment

### Vercel (Recommended)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Production deployment
vercel --prod
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

### Environment Variables for Production

```env
NEXT_PUBLIC_API_URL=https://api.odenta.uz
NEXT_PUBLIC_APP_URL=https://odenta.uz
```

---

## Future Enhancements

### Backend Integration
- [ ] Replace mock data with API calls
- [ ] Implement real authentication (Google OAuth)
- [ ] Add loading states and error handling
- [ ] Implement optimistic updates with rollback

### Features
- [ ] SMS notifications for appointments
- [ ] Email invoices to patients
- [ ] Export reports (PDF)
- [ ] Multi-language support (Uzbek, Russian, English)
- [ ] Dark mode
- [ ] Mobile app (React Native)

### Performance
- [ ] Image optimization
- [ ] Code splitting
- [ ] Lazy loading
- [ ] Service worker for offline support

### Testing
- [ ] Unit tests (Jest + React Testing Library)
- [ ] Integration tests
- [ ] E2E tests (Playwright)
- [ ] Accessibility testing

---

## Support & Maintenance

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Mobile Support
- iOS Safari 14+
- Chrome Android 90+

### Known Issues
- None (MVP complete with mock data)

### Contact
For questions or support, contact the development team.

---

**Document Version:** 1.0.0  
**Last Updated:** February 14, 2026  
**Status:** ✅ Production-Ready (Mock Data)
