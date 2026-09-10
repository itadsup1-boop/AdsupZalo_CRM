import socket
import ssl
import json
import os
import sys

# ==================== CẤU HÌNH KẾT NỐI ====================
HOST = '192.168.88.185'  # Thay bằng IP thật của máy Windows (Master)
PORT = 12345             # Port của máy Master
# =========================================================

# Tự động lấy đường dẫn tuyệt đối của thư mục chứa file code hiện tại (Chạy tốt trên cả Linux/Windows)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE = os.path.join(SCRIPT_DIR, 'zalo_cert.pem')
KEY_FILE = os.path.join(SCRIPT_DIR, 'zalo_key.pem')

def run_agent_con():
    """
    Chạy Agent Con (Client) trên Linux, chủ động kết nối tới Agent Master (Server) trên Windows.
    """
    # Tạo SSL/TLS client context
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    
    # Load client certs
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        context.load_cert_chain(CERT_FILE, KEY_FILE)
        print(f"Đã load thành công chứng chỉ: {CERT_FILE}")
    else:
        print(f"LỖI: Không tìm thấy file chứng chỉ tại: {SCRIPT_DIR}")
        print("Yêu cầu cần có cả 2 file zalo_cert.pem và zalo_key.pem nằm chung thư mục với script này.")
        sys.exit(1)
        
    secure_conn = None
    try:
        # Khởi tạo socket TCP thông thường
        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(15) # Thiết lập timeout kết nối 15 giây
        
        # Bọc socket bằng SSL
        secure_conn = context.wrap_socket(raw_sock, server_hostname=HOST)
        
        print(f"Đang kết nối tới Agent Master tại {HOST}:{PORT}...")
        secure_conn.connect((HOST, PORT))
        secure_conn.settimeout(None) # Xoá timeout sau khi kết nối thành công để lắng nghe vô hạn
        print("Kết nối và thiết lập bắt tay SSL thành công!")
        
        # Nhận tin nhắn liên tục từ Master
        while True:
            message = secure_conn.recv(4096).decode('utf-8')
            if not message:
                print("Kết nối đã bị đóng bởi Master.")
                break
            print(f"Nhận tin nhắn: {message}")
            
    except socket.timeout:
        print("Lỗi: Kết nối tới Master bị timeout (quá thời gian chờ).")
    except Exception as e:
        print(f"Lỗi socket/kết nối SSL: {e}")
    finally:
        if secure_conn:
            secure_conn.close()
        print("Đã đóng kết nối socket.")

if __name__ == '__main__':
    # Cho phép truyền IP và Port qua đối số dòng lệnh, ví dụ: python3 agent_con.py 192.168.1.100 12345
    if len(sys.argv) > 1:
        HOST = sys.argv[1]
    if len(sys.argv) > 2:
        try:
            PORT = int(sys.argv[2])
        except ValueError:
            print("Cảnh báo: Cổng truyền vào không hợp lệ. Sử dụng cổng mặc định 12345.")
            
    run_agent_con()
