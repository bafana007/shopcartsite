import { useShop } from "../context/ShopContext.jsx";

export default function Toast() {
  const { toastState, hideToast } = useShop();
  return (
    <div className={`toast${toastState.show ? " show" : ""}`} role="status">
      <span className="toast-msg">{toastState.msg}</span>
      <button className="toast-close" type="button" aria-label="Close" onClick={hideToast}>×</button>
    </div>
  );
}
