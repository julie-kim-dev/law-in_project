import express from 'express';
import AuthMiddleware from '../middlewares/auth.middleware.js';
import { prisma } from '../utils/prisma/index.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
const router = express.Router();

//NOTE - 회원가입
router.post('/sign-up', async (req, res, next) => {
  try {
    const { id, email, password, passwordCheck, nickname, content } = req.body;

    console.log(id);
    const isExistUser = await prisma.users.findFirst({
      where: {
        id: id,
      },
    });

    console.log(isExistUser);
    if (isExistUser) {
      return res.status(409).json({ message: '이미 존재하는 이메일 입니다.' });
    }

    if (password !== passwordCheck || password.length < 6) {
      return res.status(400).json({
        message: '비밀번호의 길이가 짧거나 두 비밀번호가 일치하지 않습니다.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          id,
          email,
          password: hashedPassword,
          nickname,
          content,
        },
      });

      const userInfo = await tx.users.findFirst({
        where: {
          id: user.id,
        },
        select: {
          id: true,
          email: true,
          nickname: true,
          content: true,
          role: true,
          follow: true,
        },
      });

      userInfo.follow = userInfo.follow.toString();

      return userInfo;
    });

    return res.status(201).json({ userInfo: createdUser });
  } catch (err) {
    next(err);
  }
});

//NOTE - 회원탈퇴
router.delete('/sign-out', AuthMiddleware, async (req, res) => {
  const { id } = req.user;
  const { password } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: '사용자가 찾을 수 없습니다.' });
  }
  const user = await prisma.users.findFirst({
    where: {
      id,
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: '해당 ID로 사용자를 찾을 수 없습니다.' });
  } else if (!(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
  }

  // 사용자를 삭제합니다.
  await prisma.users.delete({
    where: {
      id: user.id,
    },
  });

  return res.status(200).json({ success: true, message: '사용자가 성공적으로 삭제되었습니다.' });
});

//NOTE - 로그인
router.post('/sign-in', async (req, res) => {
  const { id, password } = req.body;

  const user = await prisma.users.findFirst({ where: { id } });
  console.log(await bcrypt.compare(password, user.password));

  if (!user) {
    return res.status(401).json({ message: '존재하지 않는 이메일 입니다.' });
  } else if (!(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
  }

  const accessToken = jwt.sign(
    {
      id: user.id,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '12h' }
  );
  const refreshToken = jwt.sign(
    {
      email: user.email,
      ip: req.ip,
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '168h' }
  );

  await prisma.users.update({
    where: {
      id: user.id,
    },
    data: {
      token: refreshToken,
    },
  });

  res.cookie('accessToken', `Bearer ${accessToken}`);
  res.cookie('refreshToken', `Bearer ${refreshToken}`);

  return res.status(200).json({ message: '로그인에 성공하였습니다.' });
});

//NOTE - 내정보 조회
router.get('/myInfo', AuthMiddleware, async (req, res) => {
  const { id } = req.user;

  const user = await prisma.users.findFirst({
    where: { id: id },
    select: {
      id: true,
      email: true,
      nickname: true,
      content: true,
      role: true,
      follow: true,
    },
  });

  user.follow = user.follow.toString();

  return res.status(200).json({ data: user });
});

//NOTE - 내정보 수정
router.patch('/myInfo', AuthMiddleware, async (req, res) => {
  const { nickname, content, password, passwordCheck } = req.body;
  const { id } = req.user;

  const user = await prisma.users.findFirst({ where: { id } });

  if (password !== passwordCheck || password.length < 6) {
    return res.status(400).json({
      message: '비밀번호의 길이가 짧거나 두 비밀번호가 일치하지 않습니다.',
    });
  }

  if (!user) {
    return res.status(401).json({ message: '아이디가 존재하지 않습니다' });
  } else if (!(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
  }

  const updateUser = await prisma.$transaction(async (tx) => {
    const user = await tx.users.update({
      where: {
        id: id,
      },
      data: {
        nickname,
        content,
      },
    });

    const userInfo = await tx.users.findFirst({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        content: true,
        role: true,
        follow: true,
      },
    });

    userInfo.follow = user.follow.toString();
    return userInfo;
  });
  return res.status(201).json({ success: '이력서 수정에 성공하였습니다.', userInfo: updateUser });
});

export default router;
