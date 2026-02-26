import React from 'react';
import { render, waitFor } from '@testing-library/react';

// --- Mocks must be declared before import ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mutable mock values so each test can configure its own scenario
let mockSession: any = null;
let mockProfile: any = null;

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: mockSession } })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: mockProfile })),
        })),
      })),
    })),
  },
}));

// Stub heavy Leaflet components used by MapEditor
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  ImageOverlay: () => null,
  Marker: () => null,
  useMapEvents: () => null,
}));

jest.mock('leaflet', () => ({
  CRS: { Simple: {} },
  divIcon: jest.fn(() => ({})),
}));

jest.mock('../data/vehicles', () => ({
  STATIC_VEHICLES: [],
}));

// Import after all mocks are set up
import MapEditor from '../components/MapEditor';

describe('MapEditor – authorisation redirects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = null;
    mockProfile = null;
  });

  it('redirects to /login when there is no session', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockSession = null;

    render(<MapEditor />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    alertSpy.mockRestore();
  });

  it('redirects to / when the user is not an admin', async () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockSession = { user: { id: 'user-1' } };
    mockProfile = { role: 'user' };

    render(<MapEditor />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    alertSpy.mockRestore();
  });

  it('does not redirect when the user is an admin', async () => {
    mockSession = { user: { id: 'admin-1' } };
    mockProfile = { role: 'admin' };

    render(<MapEditor />);

    // Give the async checkAdmin effect time to complete
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
