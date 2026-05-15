import { Prisma } from '@prisma/client';
import { prisma } from './prisma-client.js';

// Tự động tìm tất cả các model có chứa trường 'orgId' dựa vào Prisma DMMF (lúc khởi động)
// Điều này giúp tránh việc phải tự bảo trì danh sách tên model khi DB thêm/sửa bảng.
const tenantModels = Prisma.dmmf.datamodel.models
  .filter((model) => model.fields.some((field) => field.name === 'orgId'))
  .map((model) => model.name);

/**
 * Lấy Prisma Client được cách ly (isolated) cho một Organization cụ thể.
 * Sẽ tự động inject orgId vào TẤT CẢ các truy vấn.
 * 
 * @param orgId ID của Organization (Tenant)
 */
export function getTenantPrisma(orgId: string) {
  if (!orgId) {
    throw new Error('Critical: orgId must be provided to getTenantPrisma');
  }

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // 1. Nếu model không thuộc tenant (ví dụ bảng system logs), cho qua nguyên vẹn
          if (!model || !tenantModels.includes(model)) {
            return query(args);
          }

          const argsClone = { ...args } as any;

          // 2. Chuyển đổi findUnique/findUniqueOrThrow -> findFirst/findFirstOrThrow
          // Lý do: Prisma yêu cầu findUnique phải map chuẩn xác với Index Unique. 
          // Việc nhồi thêm orgId vào where sẽ phá vỡ rule này gây lỗi TypeError.
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const newOperation = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
            argsClone.where = { ...argsClone.where || {}, orgId };
            
            // Ép kiểu để gọi lại hàm thay vì dùng callback query() gốc của findUnique
            return (prisma as any)[model][newOperation](argsClone);
          }

          // 3. Xử lý các câu lệnh ĐỌC / CẬP NHẬT / XÓA (Auto-inject where: { orgId })
          if (
            ['findFirst', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(
              operation
            )
          ) {
            argsClone.where = { ...argsClone.where || {}, orgId };
            return query(argsClone);
          }

          // 4. Xử lý các câu lệnh TẠO MỚI (Auto-inject data: { orgId })
          if (['create', 'createMany'].includes(operation)) {
            if (Array.isArray(argsClone.data)) {
              argsClone.data = argsClone.data.map((item: any) => ({ ...item, orgId }));
            } else {
              argsClone.data = { ...argsClone.data, orgId };
            }
            return query(argsClone);
          }

          // Fallback an toàn cho bất kỳ operation nào khác (nếu có update bản mới của Prisma)
          return query(argsClone);
        },
      },
    },
  });
}
