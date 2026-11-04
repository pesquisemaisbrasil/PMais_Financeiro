class InvalidStatusTransition(Exception):
    def __init__(self, current_status: str, new_status: str) -> None:
        self.current_status = current_status
        self.new_status = new_status
        super().__init__(f"Cannot transition from '{current_status}' to '{new_status}'")
