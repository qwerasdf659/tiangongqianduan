import { defineComponent, h } from 'vue';

export const IconLogout = defineComponent({
  name: 'IconLogout',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M640 160H256c-36 0-64 28-64 64v576c0 36 28 64 64 64h384", "fillRule": "evenodd"})
      ]
    );
  }
});
