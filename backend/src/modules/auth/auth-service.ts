/**
 * Auth service — handles setup, join, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  orgId: string;
}

export interface InviteTokenPayload {
  orgId: string;
  orgName: string;
  type: 'invite';
}

// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const count = await prisma.user.count();
  return { needsSetup: count === 0 };
}

// Create a new organization + owner user
export async function setup(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
): Promise<JwtPayload> {
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ 
      data: { name: orgName } 
    });
    
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName,
        role: 'owner',
      },
    });
    
    return { org, user };
  });

  logger.info(`New organization registered: ${orgName} by ${email}`);

  return {
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    orgId: result.user.orgId,
  };
}

// Generate a secure, short-lived join token (15 minutes)
export async function generateJoinToken(orgId: string, orgName: string): Promise<string> {
  const payload: InviteTokenPayload = {
    orgId,
    orgName,
    type: 'invite',
  };

  return jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
}

// Join an existing organization via secure token (INSTANT JOIN)
export async function join(
  token: string,
  fullName: string,
  email: string,
  password: string,
): Promise<JwtPayload> {
  let decoded: InviteTokenPayload;
  
  try {
    decoded = jwt.verify(token, config.jwtSecret) as InviteTokenPayload;
    if (decoded.type !== 'invite') throw new Error('Invalid token type');
  } catch (err) {
    const error = new Error('Token mời đã hết hạn hoặc không hợp lệ') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const { orgId } = decoded;

  // Check if email already exists
  const existingUser = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
  });
  if (existingUser) {
    const err = new Error('Email này đã được sử dụng') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      orgId: orgId,
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName,
      role: 'member',
      isActive: true,
      isPending: false,
    },
  });

  logger.info(`New member joined via secure token. OrgId: ${orgId}`);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
  };
}

// Request to join an organization by EXACT NAME (REQUIRES APPROVAL)
export async function requestToJoin(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
): Promise<void> {
  // Find organization by exact name
  const org = await prisma.organization.findFirst({
    where: { name: { equals: orgName.trim(), mode: 'insensitive' } },
  });

  if (!org) {
    const err = new Error('Không tìm thấy tổ chức với tên này. Vui lòng nhập chính xác.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Check if email already exists
  const existingUser = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
  });
  if (existingUser) {
    const err = new Error('Email này đã được sử dụng') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      orgId: org.id,
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName,
      role: 'member',
      isActive: false, // Cannot login until approved
      isPending: true, // Mark as pending
    },
  });

  logger.info(`New join request submitted for org: ${org.name} by ${email}`);
}

// Login verification
export async function login(email: string, password: string): Promise<JwtPayload> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.toLowerCase().trim(), mode: 'insensitive' } },
  });

  if (!user || !user.passwordHash) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  if (user.isPending) {
    const err = new Error('Tài khoản của bạn đang chờ phê duyệt từ quản trị viên.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Account is deactivated') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  return { id: user.id, email: user.email, role: user.role, orgId: user.orgId };
}

// Get user profile
export async function getProfile(orgId: string, userId: string) {
  const db = getTenantPrisma(orgId);
  const user = await db.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      isPending: true,
      orgId: true,
      org: { select: { name: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return {
    ...user,
    orgName: user.org?.name,
  };
}
