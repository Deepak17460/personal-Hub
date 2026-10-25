import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .max(128, 'Password is too long'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
export type SignUpValues = z.infer<typeof signUpSchema>;

export const resetSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
});
export type ResetValues = z.infer<typeof resetSchema>;
