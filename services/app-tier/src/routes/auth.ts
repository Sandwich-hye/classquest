/** Authentication routes (report 2.3.6 / 6.1): login issues a role-scoped JWT. */
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  loginSchema,
  userRepo,
  verifyPassword,
  issueToken,
} from '@classquest/shared';
import { ApiError } from '../middleware.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid email or password format');
    }
    const { email, password } = parsed.data;
    const user = await userRepo.findByEmailWithHash(email);
    // Constant-ish response: same error for unknown user vs bad password.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const token = issueToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    });
    res.json({ token, role: user.role, displayName: user.displayName });
  } catch (err) {
    next(err);
  }
});

/** Return the current authenticated identity (used by the SPA on load). */
authRouter.get('/me', (req: Request, res: Response) => {
  // requireAuth runs ahead of this in the router wiring.
  res.json({ user: req.user });
});
