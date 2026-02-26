import axios from 'axios';

describe('GET /api', () => {
  it('should return a message', async () => {
    const res = await axios.get(`/api`);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'Hello API' });
  });
});

describe('Bookings flow', () => {
  const createWindow = (
    startOffsetMinutes: number,
    durationMinutes: number,
  ) => {
    const start = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  };

  const registerUser = async (role: 'customer' | 'provider') => {
    const email = `${role}_${Date.now()}_${Math.random()}@example.com`;
    const response = await axios.post('/api/auth/register', {
      fname: 'Test',
      lname: 'User',
      email,
      password: 'StrongPass123!',
      role,
      businessName: role === 'provider' ? 'Studio' : undefined,
    });
    return response.data.accessToken as string;
  };

  const fetchUserId = async (token: string) => {
    const response = await axios.get('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.userId as string;
  };

  it('creates and reads a booking', async () => {
    const providerToken = await registerUser('provider');
    const customerToken = await registerUser('customer');
    const providerUserId = await fetchUserId(providerToken);
    const { startTime, endTime } = createWindow(10, 60);

    const createResponse = await axios.post(
      '/api/bookings',
      { providerUserId, startTime, endTime },
      { headers: { Authorization: `Bearer ${customerToken}` } },
    );

    expect(createResponse.status).toBe(201);
    expect(createResponse.data.data.status).toBe('pending');

    const bookingId = createResponse.data.data.id as string;
    const getResponse = await axios.get(`/api/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.data.data.id).toBe(bookingId);
  });
});
